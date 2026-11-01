"""Build the approved Grade 12 timetable JSON from the review transcription."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "grade-12-timetable-review-2026-27.md"
OUTPUT = ROOT / "data" / "grade12_2026-27.json"

TEACHER_CODES = {
    "ms rekha": "T001",
    "ms neetu": "T002",
    "ms pooja k": "T072",
    "ms pooja m": "T075",
    "ms pratibha": "T039",
    "ms yogita": "T070",
    "ms sonika": "T068",
    "ms mukta": "T074",
    "ms shalu s": "T076",
    "ms anjali b": "T071",
    "ms anita": "T064",
    "ms prema": "T079",
    "ms supriya": "T051",
    "ms varnika": "T035",
    "ms gurpreet": "T023",
    "mr pankaj": "T059",
    "ms nidhi k": "T056",
    "ms priya": "T024",
    "mr chirag": "T095",
    "mr tilakraj": "T087",
}

SUBJECTS = {
    "english": "ENGLISH",
    "mark": "Mark",
    "acc": "ACCOUNTS",
    "bst": "BUSINESS STUDIES",
    "sales": "Sales",
    "eco": "ECONOMICS",
    "sports": "SPORTS",
    "supw": "SUPW",
    "bio": "BIOLOGY",
    "psy": "Psy",
    "phy": "PHYSICS",
    "phy prac": "PHYSICS",
    "pol sc": "Pol Sc",
    "chem": "CHEMISTRY",
    "chem prac": "CHEMISTRY",
    "hist": "Hist",
    "fr off": "Fr Off",
    "tour": "Tour",
}

# The handwritten 12H sheet has subjects but no teacher names. Match its
# sections to the approved staff allocation records, not to image guesses.
HANDWRITTEN_TEACHERS = {
    "ACC": ["T068"],
    "BST": ["T075"],
    "English": ["T001"],
    "Eco": ["T073"],
    "Sports": ["T095"],
    "SUPW": ["T064", "T079"],
}

OPTIONAL_TRACKS = [
    ("AI", "T066"),
    ("Biotech", "T052"),
    ("CS", "T064"),
    ("FS", "T063"),
    ("IP", "T065"),
    ("LEGAL STUDIES", "T040"),
    ("MATHS", "T041"),
    ("MATHS", "T043"),
    ("MEDIA STUDIES", "T069"),
    ("Painting", "T079"),
]


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().rstrip(".,")).casefold()


def parse_cell(cell: str, class_name: str) -> list[tuple[str, str | None]]:
    cell = cell.strip()
    if cell.upper() == "OPT":
        return [("OPT", None)]
    if cell.casefold() == "recess":
        return [("RECESS", None)]

    parsed = []
    previous_subject = None
    for piece in (part.strip() for part in cell.split(" / ")):
        if " — " in piece:
            subject_text, teacher_text = piece.split(" — ", 1)
            previous_subject = subject_text.strip()
            teacher_code = TEACHER_CODES.get(normalize(teacher_text))
            if not teacher_code:
                raise ValueError(f"Unmapped teacher in {class_name}: {piece!r}")
            parsed.append((previous_subject, teacher_code))
        elif previous_subject:
            teacher_code = TEACHER_CODES.get(normalize(piece))
            if not teacher_code:
                raise ValueError(f"Unmapped co-teacher in {class_name}: {piece!r}")
            parsed.append((previous_subject, teacher_code))
        elif class_name == "12H":
            parsed.extend((piece, teacher_code) for teacher_code in HANDWRITTEN_TEACHERS.get(piece, []))
        else:
            raise ValueError(f"Unparsed cell in {class_name}: {cell!r}")

    return parsed


def main() -> None:
    text = SOURCE.read_text()
    output = []
    day_map = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday"}
    section_pattern = re.compile(r"^## Class (12[BD EGH])\b", re.MULTILINE)
    headings = list(section_pattern.finditer(text))
    if {match.group(1).replace(" ", "") for match in headings} != {"12B", "12D", "12E", "12G", "12H"}:
        raise ValueError("Expected one confirmed timetable table each for 12B, 12D, 12E, 12G and 12H")

    for index, heading in enumerate(headings):
        class_name = heading.group(1).replace(" ", "")
        end = headings[index + 1].start() if index + 1 < len(headings) else text.find("## Cropped science", heading.end())
        section_text = text[heading.end(): end if end != -1 else len(text)]
        table_lines = [line for line in section_text.splitlines() if line.startswith("|")]
        for line in table_lines:
            columns = [column.strip() for column in line.strip().strip("|").split("|")]
            if not columns or columns[0] not in day_map:
                continue
            day = day_map[columns[0]]
            if len(columns) != 10:
                raise ValueError(f"Expected day plus 9 periods for {class_name} {day}; got {len(columns)-1}")
            for period_number, cell in enumerate(columns[1:], 1):
                for subject_text, teacher_id in parse_cell(cell, class_name):
                    subject = subject_text if subject_text in {"OPT", "RECESS"} else SUBJECTS.get(normalize(subject_text))
                    if not subject:
                        raise ValueError(f"Unmapped subject in {class_name} {day} P{period_number}: {subject_text!r}")
                    output.append({
                        "day": day,
                        "period_number": period_number,
                        "class_name": class_name,
                        "teacher_id": teacher_id,
                        "subject": subject,
                        "group_key": teacher_id if subject == "SUPW" else "",
                        "room": None,
                    })

    optional_slots = sorted({
        (row["day"], row["period_number"])
        for row in output
        if row["class_name"] in {"12B", "12D", "12E", "12G", "12H"} and row["subject"] == "OPT"
    })
    if len(optional_slots) != 8:
        raise ValueError(f"Expected 8 shared 12th-grade OPT slots, found {len(optional_slots)}")
    for day, period_number in optional_slots:
        for subject, teacher_id in OPTIONAL_TRACKS:
            output.append({
                "day": day,
                "period_number": period_number,
                "class_name": "OPT12",
                "teacher_id": teacher_id,
                "subject": subject,
                "group_key": teacher_id if subject == "MATHS" else "",
                "room": None,
            })

    keys = [(row["day"], row["period_number"], row["class_name"], row["subject"], row["group_key"]) for row in output]
    if len(keys) != len(set(keys)):
        raise ValueError("Duplicate timetable row keys were generated")
    OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(output)} timetable rows; {len(optional_slots)} shared OPT slots; {len(OPTIONAL_TRACKS)} optional groups.")


if __name__ == "__main__":
    main()
