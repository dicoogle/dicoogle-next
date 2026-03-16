CREATE TABLE application_metadata (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    metadata_value VARCHAR(255) NOT NULL
);

INSERT INTO application_metadata (key, metadata_value)
VALUES ('application.name', 'dicoogle-next');
