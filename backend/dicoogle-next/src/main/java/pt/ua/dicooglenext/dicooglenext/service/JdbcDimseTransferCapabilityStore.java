package org.dicoogle.app.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.dicoogle.app.config.DimseTransferCapabilityConfigProperties;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;

@Component
@ConditionalOnProperty(prefix = "app.dimse.cstore.config", name = "source", havingValue = "jdbc")
public class JdbcDimseTransferCapabilityStore implements DimseTransferCapabilityStore {

  private static final TypeReference<List<DimseCStoreProperties.AcceptedTransferCapability>> TYPE_REF =
      new TypeReference<>() {};

  private final ObjectMapper objectMapper;
  private final DimseTransferCapabilityConfigProperties properties;
  private final DimseCStoreProperties cstoreProperties;

  public JdbcDimseTransferCapabilityStore(
      ObjectMapper objectMapper,
      DimseTransferCapabilityConfigProperties properties,
      DimseCStoreProperties cstoreProperties) {
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.cstoreProperties = cstoreProperties;

    if (properties.getJdbc().isAutoCreateTable()) {
      ensureTable();
    }
    ensureBootstrapRow();
  }

  @Override
  public StoredCapabilities load() {
    try (Connection connection = openConnection();
        var statement =
            connection.prepareStatement(
                "SELECT version, payload, updated_by, updated_at FROM "
                    + table()
                    + " WHERE config_key = ?")) {
      statement.setString(1, configKey());

      try (ResultSet rs = statement.executeQuery()) {
        if (!rs.next()) {
          ensureBootstrapRow();
          return load();
        }
        return mapRow(rs);
      }
    } catch (SQLException ex) {
      throw new IllegalStateException("Failed to load DIMSE transfer capability config", ex);
    }
  }

  @Override
  public StoredCapabilities save(
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities,
      Long expectedVersion,
      String updatedBy) {
    try (Connection connection = openConnection()) {
      connection.setAutoCommit(false);
      StoredCapabilities current = loadForUpdate(connection);

      if (expectedVersion != null && expectedVersion.longValue() != current.version()) {
        throw new IllegalStateException(
            "Version conflict while updating DIMSE transfer capabilities");
      }

      long newVersion = current.version() + 1;
      String payload = toJson(capabilities);
      String actor = updatedBy == null || updatedBy.isBlank() ? "api" : updatedBy;
      Timestamp now = Timestamp.from(Instant.now());

      try (var update =
          connection.prepareStatement(
              "UPDATE "
                  + table()
                  + " SET version = ?, payload = ?, updated_by = ?, updated_at = ? WHERE config_key = ?")) {
        update.setLong(1, newVersion);
        update.setString(2, payload);
        update.setString(3, actor);
        update.setTimestamp(4, now);
        update.setString(5, configKey());
        update.executeUpdate();
      }

      connection.commit();
      return new StoredCapabilities(
          newVersion,
          "jdbc",
          actor,
          now.toInstant().toString(),
          List.copyOf(capabilities));
    } catch (SQLException ex) {
      throw new IllegalStateException("Failed to save DIMSE transfer capability config", ex);
    }
  }

  private StoredCapabilities loadForUpdate(Connection connection) throws SQLException {
    try (var statement =
        connection.prepareStatement(
            "SELECT version, payload, updated_by, updated_at FROM "
                + table()
                + " WHERE config_key = ? FOR UPDATE")) {
      statement.setString(1, configKey());
      try (ResultSet rs = statement.executeQuery()) {
        if (!rs.next()) {
          throw new IllegalStateException("DIMSE transfer capability row not initialized");
        }
        return mapRow(rs);
      }
    }
  }

  private StoredCapabilities mapRow(ResultSet rs) throws SQLException {
    long version = rs.getLong("version");
    String payload = rs.getString("payload");
    String updatedBy = rs.getString("updated_by");
    Timestamp updatedAt = rs.getTimestamp("updated_at");

    try {
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities =
          objectMapper.readValue(payload, TYPE_REF);
      return new StoredCapabilities(
          version,
          "jdbc",
          updatedBy,
          updatedAt == null ? Instant.now().toString() : updatedAt.toInstant().toString(),
          capabilities);
    } catch (Exception ex) {
      throw new SQLException("Invalid DIMSE capability payload", ex);
    }
  }

  private void ensureTable() {
    try (Connection connection = openConnection();
        var statement = connection.createStatement()) {
      statement.execute(
          "CREATE TABLE IF NOT EXISTS "
              + table()
              + " ("
              + "config_key VARCHAR(255) PRIMARY KEY,"
              + "version BIGINT NOT NULL,"
              + "payload TEXT NOT NULL,"
              + "updated_by VARCHAR(255) NOT NULL,"
              + "updated_at TIMESTAMP NOT NULL"
              + ")");
    } catch (SQLException ex) {
      throw new IllegalStateException("Failed to ensure DIMSE config table", ex);
    }
  }

  private void ensureBootstrapRow() {
    try (Connection connection = openConnection()) {
      connection.setAutoCommit(false);
      try (var select =
              connection.prepareStatement(
                  "SELECT config_key FROM " + table() + " WHERE config_key = ? FOR UPDATE");
          var insert =
              connection.prepareStatement(
                  "INSERT INTO "
                      + table()
                      + " (config_key, version, payload, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)")) {
        select.setString(1, configKey());
        try (ResultSet rs = select.executeQuery()) {
          if (!rs.next()) {
            insert.setString(1, configKey());
            insert.setLong(2, 0L);
            insert.setString(3, toJson(cstoreProperties.getAcceptedTransferCapabilities()));
            insert.setString(4, "bootstrap");
            insert.setTimestamp(5, Timestamp.from(Instant.now()));
            insert.executeUpdate();
          }
        }
      }
      connection.commit();
    } catch (SQLException ex) {
      throw new IllegalStateException("Failed to ensure DIMSE bootstrap config row", ex);
    }
  }

  private String toJson(List<DimseCStoreProperties.AcceptedTransferCapability> capabilities) {
    try {
      return objectMapper.writeValueAsString(capabilities);
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to serialize DIMSE transfer capabilities", ex);
    }
  }

  private Connection openConnection() throws SQLException {
    String url = properties.getJdbc().getUrl();
    if (url == null || url.isBlank()) {
      throw new IllegalStateException(
          "JDBC config source requires app.dimse.cstore.config.jdbc.url");
    }
    return DriverManager.getConnection(
        url, properties.getJdbc().getUsername(), properties.getJdbc().getPassword());
  }

  private String table() {
    return properties.getJdbc().getTableName();
  }

  private String configKey() {
    return properties.getJdbc().getConfigKey();
  }
}
