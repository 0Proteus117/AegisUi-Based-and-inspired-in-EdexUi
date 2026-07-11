from aegis_gearlab.storage.project_store import (
    delete_project,
    duplicate_project,
    list_projects,
    load_project,
    save_project,
)


def test_project_store_roundtrip(tmp_path):
    project = {
        "project_name": "DQ concept ring gear",
        "gear_type": "spur_internal",
        "parameters": {"module_mm": 2.0},
        "warnings": [],
    }
    path = save_project(project, tmp_path)
    assert path.is_file()

    loaded = load_project("DQ concept ring gear", tmp_path)
    assert loaded["project_name"] == "DQ concept ring gear"
    assert loaded["parameters"]["module_mm"] == 2.0

    duplicate = duplicate_project("DQ concept ring gear", "DQ concept ring gear copy", tmp_path)
    assert duplicate.is_file()
    assert len(list_projects(tmp_path)) == 2

    assert delete_project("DQ concept ring gear", tmp_path) is True
    assert delete_project("missing", tmp_path) is False
