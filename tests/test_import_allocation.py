import os
import subprocess
import sys
import unittest
from pathlib import Path

from scripts.import_allocation import apply_import, build_import_plan


class ImportAllocationTests(unittest.TestCase):
    def test_scripts_run_from_project_root_without_pythonpath(self):
        root = Path(__file__).resolve().parents[1]
        environment = os.environ.copy()
        environment.pop("PYTHONPATH", None)
        command = """
import importlib.util, pathlib, runpy, sys
root = pathlib.Path.cwd().resolve()
sys.path = ['scripts'] + [item for item in sys.path if item not in ('', str(root))]
namespace = runpy.run_path('scripts/import_allocation.py')
assert namespace['ROOT'] == root
assert pathlib.Path(importlib.util.find_spec('database').origin).resolve() == root / 'database.py'
"""
        result = subprocess.run(
            [sys.executable, "-c", command], cwd=root, env=environment,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        for script in ("scripts/import_allocation.py", "scripts/parse_allocation.py"):
            result = subprocess.run(
                [sys.executable, script, "--help"],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_plan_maps_csv_order_and_preserves_unparsed_rows(self):
        teachers = [
            {"teacher_name": "Example Person A", "departments": "SCIENCE", "roles": "CT", "email": "", "notes": ""},
            {"teacher_name": "Example Person B", "departments": "ART", "roles": "", "email": "", "notes": ""},
        ]
        assignments = [
            {"teacher_name": "Example Person A", "subject": "Science", "target_type": "section", "sections": "8A|8B", "periods_per_week": "4", "raw_text": "synthetic row", "source_row": "1"},
            {"teacher_name": "Example Person B", "subject": "Art", "target_type": "unparsed", "sections": "", "periods_per_week": "", "raw_text": "ambiguous synthetic text", "source_row": "2"},
            {"teacher_name": "Unknown Example", "subject": "Music", "target_type": "unparsed", "sections": "", "periods_per_week": "", "raw_text": "unmatched", "source_row": "3"},
        ]
        plan = build_import_plan(teachers, assignments)
        self.assertEqual([row["staff_code"] for row in plan["staff"]], ["T001", "T002"])
        self.assertEqual(len(plan["assignments"]), 2)
        self.assertEqual(plan["assignments"][1]["target_type"], "unparsed")
        self.assertEqual(plan["unmatched"][0]["match_count"], "0")

    def test_apply_requires_force_when_staff_exists_and_deduplicates(self):
        plan = {
            "staff": [{"staff_code": "T001", "full_name": "Example Person", "roles": [], "is_active": True}],
            "assignments": [{"staff_code": "T001", "subject": "Science", "target_type": "section", "sections": ["8A"], "periods_per_week": 4, "raw_text": "synthetic"}],
            "unmatched": [],
        }
        client = FakeClient(staff=[{"id": "id-T001", "staff_code": "T001"}])
        with self.assertRaisesRegex(ValueError, "already has rows"):
            apply_import(client, plan)
        self.assertEqual(apply_import(client, plan, force=True), (1, 1))
        self.assertEqual(apply_import(client, plan, force=True), (1, 0))
        self.assertEqual(len(client.tables["staff"]), 1)
        self.assertEqual(len(client.tables["assignments"]), 1)


class Response:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client, self.table_name = client, table
        self.action, self.payload, self.filters = "select", None, []

    def select(self, _columns):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def upsert(self, payload, on_conflict):
        assert on_conflict == "staff_code"
        self.action, self.payload = "upsert", payload
        return self

    def insert(self, payload):
        self.action, self.payload = "insert", payload
        return self

    def execute(self):
        rows = self.client.tables[self.table_name]
        if self.action == "upsert":
            for item in self.payload:
                prior = next((r for r in rows if r["staff_code"] == item["staff_code"]), None)
                if prior:
                    prior.update(item)
                else:
                    rows.append(dict(item, id=f"id-{item['staff_code']}"))
            return Response([])
        if self.action == "insert":
            rows.extend(dict(row) for row in self.payload)
            return Response(self.payload)
        return Response([dict(row) for row in rows])


class FakeClient:
    def __init__(self, staff=None, assignments=None):
        self.tables = {"staff": list(staff or []), "assignments": list(assignments or [])}

    def table(self, name):
        return Query(self, name)
