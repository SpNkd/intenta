from app.core.content import load_content_catalog


def test_russian_content_is_valid() -> None:
    catalog = load_content_catalog()

    assert "techniques" in catalog.namespaces
    assert catalog.get_text("common", "app_name") == "ИНТЕНТА"
    for namespace in ("onboarding", "activation", "outcomes", "reflections", "history"):
        assert namespace in catalog.namespaces
