#!/usr/bin/env python3
"""Conservatively parse the ALLOCATION sheet into reviewable CSV files."""

import argparse
import csv
import posixpath
import re
import zipfile
from collections import OrderedDict
from pathlib import Path
from xml.etree import ElementTree


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}
ROLE_NAMES = {
    "classincharge": "Class Incharge",
    "ct": "CT",
    "timetableincharge": "Time-Table Incharge",
    "incharge": "Incharge",
}
TEACHER_COLUMNS = [
    "teacher_name", "departments", "roles", "raw_text", "source_rows", "has_allocation"
]
ASSIGNMENT_COLUMNS = [
    "teacher_name", "department", "subject", "target_type", "sections",
    "periods_per_week", "raw_text", "source_row"
]
ISSUE_COLUMNS = ["issue_type", "teacher_name", "department", "source_row", "raw_text", "details"]
SECTION_COLUMNS = ["section"]


def column_index(reference):
    letters = re.match(r"[A-Z]+", reference).group(0)
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


def read_sheet(path, requested_name):
    with zipfile.ZipFile(path) as workbook:
        root = ElementTree.fromstring(workbook.read("xl/workbook.xml"))
        rel_root = ElementTree.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        rels = {item.attrib["Id"]: item.attrib["Target"] for item in rel_root}
        sheet_path = None
        for sheet in root.findall("main:sheets/main:sheet", NS):
            if sheet.attrib["name"] == requested_name:
                target = rels[sheet.attrib[f"{{{NS['rel']}}}id"]]
                sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(
                    posixpath.join("xl", target)
                )
                break
        if sheet_path is None:
            raise ValueError(f"Workbook has no sheet named {requested_name!r}")

        shared = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared_root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("main:si", NS):
                shared.append("".join(node.text or "" for node in item.findall(".//main:t", NS)))

        sheet_root = ElementTree.fromstring(workbook.read(sheet_path))
        rows = []
        for row in sheet_root.findall(".//main:sheetData/main:row", NS):
            values = {}
            for cell in row.findall("main:c", NS):
                ref = cell.attrib.get("r", "")
                if not ref:
                    continue
                value = cell.find("main:v", NS)
                if cell.attrib.get("t") == "inlineStr":
                    text = "".join(node.text or "" for node in cell.findall(".//main:t", NS))
                elif value is None:
                    text = ""
                elif cell.attrib.get("t") == "s":
                    text = shared[int(value.text)]
                else:
                    text = value.text or ""
                values[column_index(ref)] = text
            rows.append((int(row.attrib["r"]), values))
        return rows


def clean_teacher_name(raw_name):
    roles = []

    def replace_role(match):
        contents = match.group(1)
        parts = re.split(r"\s*[+,/]\s*", contents)
        recognized = [ROLE_NAMES.get(re.sub(r"[^a-z]", "", part.casefold())) for part in parts]
        if parts and all(recognized):
            roles.extend(recognized)
        else:
            roles.append(f"OTHER: {contents.strip()}")
        return ""

    name = re.sub(r"\(([^()]*)\)", replace_role, raw_name)
    return re.sub(r"\s+", " ", name).strip(), list(dict.fromkeys(roles))


def split_components(line):
    line = line.strip()
    if line.startswith("+"):
        line = line[1:].strip()
    line = re.sub(r"\s*\+\s*$", "", line).strip()
    pieces = []
    start = 0
    depth = 0
    for index, char in enumerate(line):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        elif char == "+" and depth == 0:
            right = line[index + 1:]
            starts_label = re.match(r"\s*[A-Za-z][A-Za-z0-9 &/.-]*?\s*-\s*", right)
            if line[index - 1:index].isspace() or right[:1].isspace() or starts_label:
                pieces.append(line[start:index].strip())
                start = index + 1
    pieces.append(line[start:].strip())
    return [piece for piece in pieces if piece]


def subject_and_body(component, department):
    match = re.match(r"^([A-Za-z][A-Za-z0-9 &/.-]*?)\s*-\s*(.+)$", component.strip())
    if match:
        label = match.group(1).strip(" .-/")
        body = match.group(2).strip()
        nested = re.match(r"^([A-Za-z][A-Za-z0-9 &/.-]*?)\s*-\s*(.+)$", body)
        if label.casefold() == "sanskrit" and nested and nested.group(1).strip(" .-/").casefold() == "sans":
            return "Sans", nested.group(2).strip()
        if label and body:
            return label, body
    return department, component.strip()


def split_top_level_commas(text):
    pieces = []
    start = 0
    depth = 0
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            pieces.append(text[start:index].strip())
            start = index + 1
    pieces.append(text[start:].strip())
    return [piece for piece in pieces if piece]


def expand_range(token):
    match = re.fullmatch(r"(\d+)([A-Za-z]+)\s+to\s+(\d+)([A-Za-z]+)", token, re.I)
    if not match:
        return None
    first_number, first_suffix, last_number, last_suffix = match.groups()
    first_number, last_number = int(first_number), int(last_number)
    first_suffix, last_suffix = first_suffix, last_suffix
    if first_number == last_number and len(first_suffix) == len(last_suffix) == 1:
        start, end = ord(first_suffix.upper()), ord(last_suffix.upper())
        if start <= end:
            return [f"{first_number}{chr(letter)}" for letter in range(start, end + 1)]
    if first_suffix.casefold() == last_suffix.casefold() and first_number <= last_number:
        return [f"{number}{first_suffix}" for number in range(first_number, last_number + 1)]
    return None


def parse_entity(token):
    token = token.strip()
    ranged = expand_range(token)
    if ranged:
        return [("section", [section], None) for section in ranged]

    optional = re.fullmatch(r"(OPT\d+)(?:\((\d+)\))?", token, re.I)
    if optional:
        return [("optional_group", [optional.group(1).upper()],
                 int(optional.group(2)) if optional.group(2) else None)]

    grouped = re.fullmatch(r"(\d+)\(([A-Za-z]+(?:\+[A-Za-z]+)+)\)\s*(?:\((\d+)\))?", token)
    if grouped:
        grade, group, periods = grouped.groups()
        sections = [f"{grade}{part}" for part in group.split("+")]
        return [("combined_group", sections, int(periods) if periods else None)]

    cross_grade = re.fullmatch(r"(\d+[A-Za-z]+)\+(\d+[A-Za-z]+)\s*(?:\((\d+)\))?", token)
    if cross_grade:
        first, second, periods = cross_grade.groups()
        return [("combined_group", [first, second], int(periods) if periods else None)]

    section = re.fullmatch(r"(\d+[A-Za-z]+)\s*(?:\((\d+)\))?", token)
    if section:
        label, periods = section.groups()
        return [("section", [label], int(periods) if periods else None)]
    return None


def parse_component(component, department):
    subject, body = subject_and_body(component, department)
    parsed = []
    failures = []
    distributions = []
    for token in split_top_level_commas(body):
        token_bracket = re.search(r"\[\s*(\d+)\s*[xX]\s*(\d+)\s*\]\s*$", token)
        token_parenthesis = re.search(r"\(\s*(\d+)\s*[xX]\s*(\d+)\s*\)\s*$", token)
        token_match = token_bracket or token_parenthesis
        token_distribution = None
        if token_match:
            token_distribution = (int(token_match.group(1)), int(token_match.group(2)))
            token = token[:token_match.start()].strip()
        entities = parse_entity(token)
        if entities is None:
            failures.append(token)
        else:
            start_index = len(parsed)
            parsed.extend((kind, sections, periods, token) for kind, sections, periods in entities)
            if token_distribution:
                distributions.append((token_distribution, start_index, len(parsed), token))

    for distribution, start_index, end_index, token in distributions:
        period_count, target_count = distribution
        local_targets = end_index - start_index
        if local_targets == target_count:
            for index in range(start_index, end_index):
                kind, sections, existing_periods, raw = parsed[index]
                parsed[index] = (kind, sections, period_count, raw)
        elif len(parsed) == target_count:
            for index, (kind, sections, existing_periods, raw) in enumerate(parsed):
                parsed[index] = (kind, sections, period_count, raw)
        else:
            details = (
                f"Notation says {target_count} targets at {period_count} periods/week; "
                f"the marked target has {local_targets} and the full component has {len(parsed)} targets."
            )
            return [{
                "subject": subject,
                "target_type": "unparsed",
                "sections": [],
                "periods_per_week": None,
                "raw_text": component.strip(),
            }], [("section_count_mismatch", component.strip(), details)]

    output = []
    for kind, sections, explicit_periods, token in parsed:
        output.append({
            "subject": subject,
            "target_type": kind,
            "sections": sections,
            "periods_per_week": explicit_periods,
            "raw_text": component.strip(),
        })
    for token in failures:
        output.append({
            "subject": subject,
            "target_type": "unparsed",
            "sections": [],
            "periods_per_week": None,
            "raw_text": token if token else component.strip(),
        })
    if not output:
        return [{
            "subject": subject,
            "target_type": "unparsed",
            "sections": [],
            "periods_per_week": None,
            "raw_text": component.strip(),
        }], []
    return output, [("unparsed_allocation", token,
                     "Could not parse this allocation target with confidence; retained as unparsed.")
                    for token in failures]


def extract_cell_multiplier(allocation):
    pattern = re.compile(r"\[\s*(\d+)\s*[xX]\s*(\d+)\s*\]\s*$")
    matches = list(re.finditer(r"\[\s*\d+\s*[xX]\s*\d+\s*\]", allocation))
    if len(matches) != 1:
        return allocation, None
    match = pattern.search(allocation)
    if not match:
        return allocation, None
    periods = int(match.group(1))
    target_count = int(match.group(2))
    return allocation[:match.start()].rstrip(), (periods, target_count)


def section_sort_key(section):
    match = re.fullmatch(r"(\d+)([A-Za-z]*)", section)
    if match:
        return (0, int(match.group(1)), match.group(2).casefold())
    return (1, 0, section.casefold())


def normalized_name_tokens(name):
    tokens = re.findall(r"[a-z0-9]+", name.casefold())
    if tokens and tokens[0] in {"ms", "mr"}:
        tokens = tokens[1:]
    return tokens


def names_may_be_duplicates(first, second):
    first_tokens = normalized_name_tokens(first)
    second_tokens = normalized_name_tokens(second)
    if not first_tokens or not second_tokens:
        return False
    first_prefix = first_tokens == second_tokens[:len(first_tokens)]
    second_prefix = second_tokens == first_tokens[:len(second_tokens)]
    first_subset = set(first_tokens).issubset(second_tokens)
    second_subset = set(second_tokens).issubset(first_tokens)
    return first_prefix or second_prefix or first_subset or second_subset


def issue(issues, issue_type, teacher, department, source_row, raw_text, details):
    issues.append({
        "issue_type": issue_type,
        "teacher_name": teacher,
        "department": department,
        "source_row": source_row,
        "raw_text": raw_text,
        "details": details,
    })


def parse_workbook(path):
    source_rows = read_sheet(path, "ALLOCATION")
    people = OrderedDict()
    row_records = []
    department = ""
    issues = []

    for row_number, values in source_rows:
        serial = values.get(1, "").strip()
        name_cell = values.get(2, "").strip()
        allocation = values.get(3, "").strip()
        if serial.casefold() == "s.no." or name_cell.casefold() == "name of teacher":
            continue
        if not serial and name_cell and not allocation:
            department = name_cell
            continue
        if not serial.isdigit() or not name_cell:
            continue

        teacher_name, roles = clean_teacher_name(name_cell)
        key = re.sub(r"\s+", " ", teacher_name).strip().casefold()
        key = re.sub(r"^(ms|mr)\.\s+", r"\1 ", key)
        person = people.setdefault(key, {
            "teacher_name": teacher_name,
            "departments": [], "roles": [], "raw_entries": [], "source_rows": [],
            "has_allocation": False,
        })
        if department and department not in person["departments"]:
            person["departments"].append(department)
        for role in roles:
            if role not in person["roles"]:
                person["roles"].append(role)
        if row_number not in person["source_rows"]:
            person["source_rows"].append(row_number)
        if allocation:
            person["has_allocation"] = True
            person["raw_entries"].append(f"row {row_number} [{department}]: {allocation}")
        else:
            person["raw_entries"].append(f"row {row_number} [{department}]: [blank]")
        row_records.append({
            "teacher_key": key, "teacher_name": teacher_name, "department": department,
            "roles": roles, "allocation": allocation, "source_row": row_number,
        })

        unknown_brackets = re.findall(r"\(([^()]*)\)", name_cell)
        for descriptor in unknown_brackets:
            parts = re.split(r"\s*[+,/]\s*", descriptor)
            if not parts or not all(
                re.sub(r"[^a-z]", "", part.casefold()) in ROLE_NAMES for part in parts
            ):
                issue(issues, "unrecognized_name_parenthetical", teacher_name, department,
                      row_number, descriptor,
                      "Parenthetical text was kept as OTHER in roles, not interpreted; confirm its meaning.")

    assignments = []
    seen_lines = {}
    seen_assignments = {}
    parsed_by_teacher = {}
    for row in row_records:
        if not row["allocation"]:
            continue
        allocation_text, cell_distribution = extract_cell_multiplier(row["allocation"])
        components = []
        for line in allocation_text.splitlines():
            components.extend(split_components(line))
        cell_assignments = []
        for component in components:
            normalized = re.sub(r"\s+", " ", component).strip().casefold()
            dedupe_key = (row["teacher_key"], normalized)
            if dedupe_key in seen_lines:
                previous = seen_lines[dedupe_key]
                issue(issues, "duplicate_assignment_line", row["teacher_name"], row["department"],
                      row["source_row"], component,
                      f"Dropped exact repeated allocation text; first occurrence was row {previous['source_row']} "
                      f"under {previous['department']}.")
                continue
            seen_lines[dedupe_key] = row

            parsed, parse_issues = parse_component(component, row["department"])
            for assignment in parsed:
                assignment.update({
                    "teacher_name": row["teacher_name"],
                    "department": row["department"],
                    "sections": "|".join(assignment["sections"]),
                    "source_row": row["source_row"],
                })
                cell_assignments.append(assignment)
            for issue_type, raw, details in parse_issues:
                issue(issues, issue_type, row["teacher_name"], row["department"],
                      row["source_row"], raw, details)

        if cell_distribution:
            cell_periods, expected_count = cell_distribution
            target_assignments = [item for item in cell_assignments if item["target_type"] != "unparsed"]
            if len(target_assignments) != expected_count:
                issue(issues, "section_count_mismatch", row["teacher_name"], row["department"],
                      row["source_row"], row["allocation"],
                      f"Cell notation says {expected_count} targets at {cell_periods} periods/week; "
                      f"parsed {len(target_assignments)} targets across '+'-joined parts. "
                      "Periods left unset for these targets.")
            else:
                for assignment in target_assignments:
                    assignment["periods_per_week"] = cell_periods

        for assignment in cell_assignments:
            if assignment["target_type"] != "unparsed":
                duplicate_subject = assignment["subject"].casefold()
                duplicate_subject = {
                    "sanskrit": "sans",
                    "english": "eng",
                }.get(duplicate_subject, duplicate_subject)
                semantic_key = (
                    row["teacher_key"], duplicate_subject, assignment["target_type"],
                    assignment["sections"], assignment["periods_per_week"],
                )
                if semantic_key in seen_assignments:
                    previous = seen_assignments[semantic_key]
                    issue(issues, "duplicate_assignment", row["teacher_name"], row["department"],
                          row["source_row"], assignment["raw_text"],
                          f"Dropped duplicate assignment for {assignment['subject']} "
                          f"{assignment['sections']} ({assignment['periods_per_week']} periods/week); "
                          f"first occurrence was row {previous['source_row']} under {previous['department']}.")
                    continue
                seen_assignments[semantic_key] = assignment
                parsed_by_teacher[row["teacher_key"]] = True
            assignments.append(assignment)

    for key, person in people.items():
        if not person["has_allocation"]:
            issue(issues, "no_allocation", person["teacher_name"],
                  "|".join(person["departments"]), "|".join(map(str, person["source_rows"])), "",
                  "Teacher row has a blank allocation cell; retained in teachers.csv.")
        elif not parsed_by_teacher.get(key):
            issue(issues, "no_parsed_assignments", person["teacher_name"],
                  "|".join(person["departments"]), "|".join(map(str, person["source_rows"])),
                  "\n".join(person["raw_entries"]),
                  "No confident section/group assignment was parsed; raw allocation is retained.")

    names = [person["teacher_name"] for person in people.values()]
    for index, first in enumerate(names):
        for second in names[index + 1:]:
            if names_may_be_duplicates(first, second):
                issue(issues, "possible_duplicate", first, "", "", "",
                      f"Near-match also present: {second}; kept separate pending confirmation.")
                issue(issues, "possible_duplicate", second, "", "", "",
                      f"Near-match also present: {first}; kept separate pending confirmation.")

    teacher_rows = []
    for person in people.values():
        teacher_rows.append({
            "teacher_name": person["teacher_name"],
            "departments": "|".join(person["departments"]),
            "roles": "|".join(person["roles"]),
            "raw_text": "\n".join(person["raw_entries"]),
            "source_rows": "|".join(map(str, person["source_rows"])),
            "has_allocation": str(person["has_allocation"]).lower(),
        })
    return teacher_rows, assignments, issues


def write_csv(path, columns, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("data/allocation/for_prabjee.xlsx"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/allocation/out"))
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"input workbook not found: {args.input}")

    teachers, assignments, issues = parse_workbook(args.input)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    sections = sorted({
        section
        for assignment in assignments
        if assignment["target_type"] != "unparsed"
        for section in assignment["sections"].split("|")
        if section
    }, key=section_sort_key)
    write_csv(args.output_dir / "teachers.csv", TEACHER_COLUMNS, teachers)
    write_csv(args.output_dir / "assignments.csv", ASSIGNMENT_COLUMNS, assignments)
    write_csv(args.output_dir / "issues.csv", ISSUE_COLUMNS, issues)
    write_csv(args.output_dir / "sections.csv", SECTION_COLUMNS,
              [{"section": section} for section in sections])
    print(f"Wrote {len(teachers)} teachers, {len(assignments)} assignments, {len(issues)} issues to {args.output_dir}")


if __name__ == "__main__":
    main()
