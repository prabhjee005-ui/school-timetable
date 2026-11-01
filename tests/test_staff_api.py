import os
import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import staff as staff_router


class Response:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client, self.table_name = client, table
        self.action, self.payload = "select", None
        self.filters, self.orders, self.limit_value = [], [], None

    def select(self, _columns): return self
    def order(self, column): self.orders.append(column); return self
    def limit(self, value): self.limit_value = value; return self
    def eq(self, key, value): self.filters.append((key, value)); return self
    def insert(self, payload): self.action, self.payload = "insert", payload; return self
    def update(self, payload): self.action, self.payload = "update", payload; return self
    def delete(self): self.action = "delete"; return self

    def execute(self):
        rows = self.client.tables[self.table_name]
        matched = [r for r in rows if all(r.get(key) == value for key, value in self.filters)]
        if self.action == "insert":
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = [dict(row, id=f"new-{len(rows) + i}") for i, row in enumerate(payload)]
            rows.extend(inserted)
            return Response(inserted)
        if self.action == "update":
            for row in matched: row.update(self.payload)
            return Response(matched)
        if self.action == "delete":
            self.client.tables[self.table_name] = [row for row in rows if row not in matched]
            return Response(matched)
        if self.limit_value is not None: matched = matched[:self.limit_value]
        return Response([dict(row) for row in matched])


class FakeClient:
    def __init__(self):
        self.tables = {
            "staff": [
                {"id": "s1", "staff_code": "T001", "full_name": "Example Person", "department": "SCIENCE", "roles": ["CT"], "email": None, "notes": None, "is_active": True, "created_at": "now"},
                {"id": "s2", "staff_code": "T002", "full_name": "Example Person B", "department": "ART", "roles": [], "email": None, "notes": None, "is_active": True, "created_at": "now"},
            ],
            "assignments": [
                {"id": "a1", "staff_id": "s1", "subject": "Science", "target_type": "section", "sections": ["8A"], "periods_per_week": 4, "raw_text": None, "created_at": "now"},
                {"id": "a2", "staff_id": "s1", "subject": "Science", "target_type": "unparsed", "sections": [], "periods_per_week": None, "raw_text": "ambiguous", "created_at": "now"},
            ],
        }

    def table(self, name): return Query(self, name)


class StaffApiTests(unittest.TestCase):
    def setUp(self):
        self.old_flag = os.environ.get("STAFF_WRITE_ENABLED")
        os.environ.pop("STAFF_WRITE_ENABLED", None)
        self.original_client_factory = staff_router.get_supabase_client
        self.database = FakeClient()
        staff_router.get_supabase_client = lambda: self.database
        app = FastAPI()
        app.include_router(staff_router.router)
        self.api = TestClient(app)

    def tearDown(self):
        staff_router.get_supabase_client = self.original_client_factory
        if self.old_flag is None:
            os.environ.pop("STAFF_WRITE_ENABLED", None)
        else:
            os.environ["STAFF_WRITE_ENABLED"] = self.old_flag

    def test_staff_reads_details_issues_and_sections(self):
        listed = self.api.get("/staff?search=person&department=SCIENCE").json()["staff"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["assignment_count"], 2)
        self.assertNotIn("password_hash", listed[0])
        detail = self.api.get("/staff/s1").json()["staff"]
        self.assertEqual(len(detail["assignments"]), 2)
        issues = self.api.get("/staff/issues").json()
        self.assertEqual(len(issues["staff_without_assignments"]), 1)
        self.assertEqual(len(issues["unparsed_assignments"]), 1)
        sections = self.api.get("/sections").json()["sections"]
        self.assertEqual(len(sections), 48)

    def test_writes_default_off_and_sections_are_validated(self):
        self.assertEqual(self.api.post("/staff", json={"invalid": "payload"}).status_code, 403)
        os.environ["STAFF_WRITE_ENABLED"] = "true"
        invalid = self.api.post("/staff/s1/assignments", json={"target_type": "section", "sections": ["99Z"]})
        self.assertEqual(invalid.status_code, 422)
        invalid_type = self.api.post("/staff/s1/assignments", json={"target_type": "mystery", "sections": []})
        self.assertEqual(invalid_type.status_code, 422)

    def test_soft_delete_and_assignment_mutations_are_gated(self):
        os.environ["STAFF_WRITE_ENABLED"] = "true"
        created = self.api.post("/staff", json={"staff_code": "T003", "full_name": "Example New", "roles": []})
        self.assertEqual(created.status_code, 201)
        self.assertNotIn("password_hash", created.json()["staff"])
        self.assertEqual(self.api.patch("/staff/s2", json={"department": "MUSIC"}).status_code, 200)
        added_assignment = self.api.post("/staff/s1/assignments", json={"target_type": "optional_group", "sections": ["OPT11"]})
        self.assertEqual(added_assignment.status_code, 201)
        result = self.api.delete("/staff/s2")
        self.assertEqual(result.status_code, 200)
        self.assertFalse(next(row for row in self.database.tables["staff"] if row["id"] == "s2")["is_active"])
        self.assertEqual(self.api.patch("/assignments/a1", json={"periods_per_week": 5}).status_code, 200)
        deleted_assignment = self.api.delete("/assignments/a1")
        self.assertEqual(deleted_assignment.status_code, 200)
        os.environ["STAFF_WRITE_ENABLED"] = "false"
        self.assertEqual(self.api.delete("/assignments/a1").status_code, 403)
