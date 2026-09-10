import json
import string
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator

from app.core.config import get_settings

type ContentData = dict[str, str] | list[dict[str, object]]


class ContentDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1)
    locale: str = Field(min_length=2, max_length=10)
    namespace: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    data: ContentData


class Technique(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=1000)
    category: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    active: bool


class TechniqueList(RootModel[list[Technique]]):
    @model_validator(mode="after")
    def keys_and_versions_are_unique(self) -> "TechniqueList":
        identities = [(item.key, item.version) for item in self.root]
        if len(identities) != len(set(identities)):
            raise ValueError("technique key/version pairs must be unique")
        return self


class IntentionContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_intro: str
    amount_action: str
    about_action: str
    question: str
    input_label: str
    input_placeholder: str
    save_draft_action: str
    paper_title: str
    paper_instruction: str
    paper_written_action: str
    edit_action: str
    technique_label: str
    experiment_completed_title: str
    experiment_completed_description: str
    history_action: str
    statement_template_key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    statement_template_version: str = Field(pattern=r"^[1-9][0-9]*$")
    statement_template: str

    @model_validator(mode="after")
    def statement_has_only_supported_placeholders(self) -> "IntentionContent":
        fields = {
            name
            for _, name, _, _ in string.Formatter().parse(self.statement_template)
            if name is not None
        }
        if fields != {"amount", "intention_text"}:
            raise ValueError("statement template must contain amount and intention_text only")
        return self


class MessageContent(BaseModel):
    model_config = ConfigDict(extra="forbid")


REQUIRED_MESSAGE_KEYS = {
    "activation": {
        "activate_action",
        "created_title",
        "created_description",
        "happened_action",
        "finish_action",
    },
    "outcomes": {
        "happened_title",
        "expected_label",
        "spending_label",
        "save_action",
        "summary_title",
    },
    "reflections": {"title", "description", "continue_action", "deferral_error"},
    "history": {"title", "load_error", "detail_load_error", "outcome_title", "back_action"},
}


class ContentCatalog:
    def __init__(self, documents: dict[str, ContentDocument]) -> None:
        self._documents = documents

    @classmethod
    def load(cls, directory: Path) -> "ContentCatalog":
        documents: dict[str, ContentDocument] = {}
        for path in sorted(directory.glob("*.json")):
            document = ContentDocument.model_validate(json.loads(path.read_text(encoding="utf-8")))
            if document.locale != directory.name:
                raise ValueError(f"{path}: locale must match directory name")
            if document.namespace != path.stem:
                raise ValueError(f"{path}: namespace must match file name")
            if document.namespace in documents:
                raise ValueError(f"duplicate content namespace: {document.namespace}")
            if document.namespace == "techniques":
                TechniqueList.model_validate(document.data)
            if document.namespace == "intentions":
                IntentionContent.model_validate(document.data)
            if document.namespace in REQUIRED_MESSAGE_KEYS:
                if not isinstance(document.data, dict) or not REQUIRED_MESSAGE_KEYS[
                    document.namespace
                ].issubset(document.data):
                    raise ValueError(f"{path}: required message keys are missing")
            if document.namespace == "onboarding":
                if not isinstance(document.data, list) or [
                    item.get("key") for item in document.data if isinstance(item, dict)
                ] != ["experiment_amount", "personal_choice", "handwritten_intention", "observe"]:
                    raise ValueError(f"{path}: onboarding steps must match the MVP flow")
            documents[document.namespace] = document
        if not documents:
            raise ValueError(f"no content documents found in {directory}")
        return cls(documents)

    @property
    def namespaces(self) -> tuple[str, ...]:
        return tuple(sorted(self._documents))

    def get_text(self, namespace: str, key: str) -> str:
        data = self._documents[namespace].data
        if not isinstance(data, dict):
            raise TypeError(f"content namespace {namespace!r} does not contain messages")
        return data[key]


def load_content_catalog() -> ContentCatalog:
    return ContentCatalog.load(get_settings().content_dir)
