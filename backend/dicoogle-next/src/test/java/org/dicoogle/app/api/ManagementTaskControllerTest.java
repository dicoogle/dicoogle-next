package org.dicoogle.app.api;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ManagementTaskControllerTest {

  @Autowired private MockMvc mockMvc;

  @TempDir Path tempDir;

  @Test
  void removeRequiresAuthentication() throws Exception {
    mockMvc
        .perform(post("/management/tasks/remove").param("uri", "file:///x.dcm"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void removeAnswersNotImplementedWhenNoPluginCanDeleteTheScheme() throws Exception {
    mockMvc
        .perform(
            post("/management/tasks/remove")
                .with(user("dicoogle").roles("ADMIN"))
                .param("uri", "azblob://container/a/b.dcm"))
        .andExpect(status().isNotImplemented())
        .andExpect(jsonPath("$.error").value("No storage plugin can delete azblob: URIs"));
  }

  @Test
  void removeRejectsUriWithoutScheme() throws Exception {
    mockMvc
        .perform(
            post("/management/tasks/remove")
                .with(user("dicoogle").roles("ADMIN"))
                .param("uri", "relative/path.dcm"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void removeStillDeletesLocalFilesWhenNoFilePluginCanDelete() throws Exception {
    Path file = Files.writeString(tempDir.resolve("x.dcm"), "data");

    mockMvc
        .perform(
            post("/management/tasks/remove")
                .with(user("dicoogle").roles("ADMIN"))
                .param("uri", file.toUri().toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.deleted").value(1));

    assertFalse(Files.exists(file));
  }
}
