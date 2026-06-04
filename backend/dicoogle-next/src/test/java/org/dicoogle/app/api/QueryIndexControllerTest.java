package org.dicoogle.app.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class QueryIndexControllerTest {

  private static Path testDataRoot;

  @Autowired private MockMvc mockMvc;

  @BeforeAll
  static void preparePaths() throws Exception {
    testDataRoot = Files.createTempDirectory("index-controller-paths");
    Files.writeString(testDataRoot.resolve("not-dicom.txt"), "hello");
  }

  @Test
  void indexStatusRequiresAuthentication() throws Exception {
    mockMvc.perform(get("/system/index/status")).andExpect(status().isUnauthorized());
  }

  @Test
  void indexStatusReturnsOkForAuthenticatedUser() throws Exception {
    mockMvc
        .perform(get("/system/index/status").with(httpBasic("developer", "developer")))
        .andExpect(status().isOk());
  }

  @Test
  void reindexRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/system/index/reindex")).andExpect(status().isUnauthorized());
  }

  @Test
  void reindexReturnsOkForAuthenticatedUser() throws Exception {
    mockMvc
        .perform(post("/system/index/reindex").with(httpBasic("developer", "developer")))
        .andExpect(status().isOk());
  }

  @Test
  void indexPathRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/system/index/index")).andExpect(status().isUnauthorized());
  }

  @Test
  void unindexPathRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/system/index/unindex")).andExpect(status().isUnauthorized());
  }

  @Test
  void indexPathReturnsBadRequestForUnknownPlugin() throws Exception {
    String json =
        """
        {
          "uris": ["%s"],
          "pluginId": "missing"
        }
        """
            .formatted(testDataRoot.toString());

    mockMvc
        .perform(
            post("/system/index/index")
                .with(httpBasic("developer", "developer"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json))
        .andExpect(status().isBadRequest());
  }

  @Test
  void indexPathAcceptsPlainFilesystemPath() throws Exception {
    String json =
        """
        {
          "uris": ["%s"],
            "pluginId": "lucene"
        }
        """
            .formatted(testDataRoot.toString().replace("\\", "\\\\"));

    mockMvc
        .perform(
            post("/system/index/index")
                .with(httpBasic("developer", "developer"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json))
        .andExpect(status().isOk());
  }
}
