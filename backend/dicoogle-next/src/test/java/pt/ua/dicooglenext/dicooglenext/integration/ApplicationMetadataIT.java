package pt.ua.dicooglenext.dicooglenext.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class ApplicationMetadataIT {

  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void flywayBaselineDataIsAvailable() {
    Map<String, Object> row =
        jdbcTemplate.queryForMap(
            "select key, metadata_value from application_metadata where key = ?",
            "application.name");

    assertThat(row.get("metadata_value")).isEqualTo("dicoogle-next");
  }
}
