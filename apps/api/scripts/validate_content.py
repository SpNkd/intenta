from app.core.content import load_content_catalog


def main() -> None:
    catalog = load_content_catalog()
    print(f"Validated content namespaces: {', '.join(catalog.namespaces)}")


if __name__ == "__main__":
    main()
