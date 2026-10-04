import unittest

from fastapi import HTTPException

from routers import timetable


class Response:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.filters = []

    def select(self, _columns):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def limit(self, _value):
        return self

    def range(self, _start, _end):
        return self

    def execute(self):
        rows = self.client.tables[self.table_name]
        return Response([row for row in rows if all(row.get(key) == value for key, value in self.filters)])


class FakeClient:
    def __init__(self, *, assignments=None, timetable_rows=None):
        self.tables = {
            "settings": [{"id": "school_config", "value": {
                "class_names": ["8A", "8B", "8C", "12B"],
                "operating_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                "num_periods": 9,
            }}],
            "teachers": [
                {"id": "T001", "role": "teacher"},
                {"id": "T002", "role": "teacher"},
                {"id": "T003", "role": "teacher"},
            ],
            "staff": [
                {"id": "staff-1", "staff_code": "T001"},
                {"id": "staff-2", "staff_code": "T002"},
                {"id": "staff-3", "staff_code": "T003"},
            ],
            "assignments": list(assignments or []),
            "timetable": list(timetable_rows or []),
        }

    def table(self, name):
        return Query(self, name)


class TimetableConstraintTests(unittest.TestCase):
    def test_allows_only_the_exact_combined_group_to_share_a_teacher_slot(self):
        client = FakeClient(assignments=[{
            "staff_id": "staff-1", "subject": "Science", "target_type": "combined_group", "sections": ["8A", "8B"]
        }])
        entries = [
            {"day": "Monday", "period_number": 1, "class_name": section, "teacher_id": "T001", "subject": "Science"}
            for section in ("8A", "8B")
        ]
        timetable._validate_timetable_changes(client, entries, [])

    def test_rejects_unallocated_teachers_and_teacher_double_booking(self):
        client = FakeClient(assignments=[
            {"staff_id": "staff-1", "subject": "Science", "target_type": "section", "sections": ["8A"]},
            {"staff_id": "staff-1", "subject": "Science", "target_type": "section", "sections": ["8B"]},
        ])
        with self.assertRaises(HTTPException) as unallocated:
            timetable._validate_timetable_changes(client, [{
                "day": "Monday", "period_number": 1, "class_name": "8C", "teacher_id": "T001", "subject": "Science"
            }], [])
        self.assertEqual(unallocated.exception.status_code, 422)

        entries = [
            {"day": "Monday", "period_number": 1, "class_name": section, "teacher_id": "T001", "subject": "Science"}
            for section in ("8A", "8B")
        ]
        with self.assertRaises(HTTPException) as collision:
            timetable._validate_timetable_changes(client, entries, [])
        self.assertEqual(collision.exception.status_code, 409)

    def test_allows_parallel_subject_groups_with_different_teachers_in_same_class_slot(self):
        client = FakeClient(assignments=[
            {"staff_id": "staff-1", "subject": "Biology", "target_type": "section", "sections": ["12B"]},
            {"staff_id": "staff-2", "subject": "Psychology", "target_type": "section", "sections": ["12B"]},
            {"staff_id": "staff-3", "subject": "Economics", "target_type": "section", "sections": ["12B"]},
        ])
        entries = [
            {"day": "Monday", "period_number": 1, "class_name": "12B", "teacher_id": "T001", "subject": "Biology"},
            {"day": "Monday", "period_number": 1, "class_name": "12B", "teacher_id": "T002", "subject": "Psychology"},
            {"day": "Monday", "period_number": 1, "class_name": "12B", "teacher_id": "T003", "subject": "Economics"},
        ]
        timetable._validate_timetable_changes(client, entries, [])

    def test_rejects_one_teacher_for_two_parallel_groups_in_same_slot(self):
        client = FakeClient(assignments=[
            {"staff_id": "staff-1", "subject": "Biology", "target_type": "section", "sections": ["12B"]},
            {"staff_id": "staff-1", "subject": "Economics", "target_type": "section", "sections": ["12B"]},
        ])
        entries = [
            {"day": "Monday", "period_number": 1, "class_name": "12B", "teacher_id": "T001", "subject": "Biology"},
            {"day": "Monday", "period_number": 1, "class_name": "12B", "teacher_id": "T001", "subject": "Economics"},
        ]
        with self.assertRaises(HTTPException) as collision:
            timetable._validate_timetable_changes(client, entries, [])
        self.assertEqual(collision.exception.status_code, 409)

    def test_rejects_non_operating_days_and_period_ten(self):
        with self.assertRaises(ValueError):
            timetable.TimetableEntry(
                day="Monday", period_number=10, class_name="8A", teacher_id="T001", subject="Science"
            )
        client = FakeClient(assignments=[{
            "staff_id": "staff-1", "subject": "Science", "target_type": "section", "sections": ["8A"]
        }])
        with self.assertRaises(HTTPException) as day_error:
            timetable._validate_timetable_changes(client, [{
                "day": "Saturday", "period_number": 1, "class_name": "8A", "teacher_id": "T001", "subject": "Science"
            }], [])
        self.assertEqual(day_error.exception.status_code, 422)
