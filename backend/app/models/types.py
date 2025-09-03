from sqlalchemy import Enum as SAEnum


class CaseInsensitiveEnum(SAEnum):
    """Enum column type that accepts case-insensitive values."""

    def __init__(self, enum_cls, **kwargs):
        self._enum_cls = enum_cls
        self._enum_kwargs = kwargs.copy()
        kwargs.setdefault("values_callable", lambda enum: [e.value for e in enum])
        super().__init__(enum_cls, **kwargs)

    def adapt(self, impltype, **kw):
        params = {**self._enum_kwargs, **kw}
        return CaseInsensitiveEnum(self._enum_cls, **params)

    def bind_processor(self, dialect):
        parent = super().bind_processor(dialect)

        def process(value):
            if value is None:
                return None
            if isinstance(value, str):
                value = value.lower()
            else:
                value = value.value
            if parent:
                return parent(value)
            return value

        return process

    def result_processor(self, dialect, coltype):
        parent = super().result_processor(dialect, coltype)

        def process(value):
            if value is None:
                return None
            if isinstance(value, str):
                value = value.lower()
            if parent:
                return parent(value)
            return value

        return process
