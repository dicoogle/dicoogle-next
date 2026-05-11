package org.dicoogle.app.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PluginControllerTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void pluginStatusRequiresAuthentication() throws Exception {
    mockMvc.perform(get("/system/plugins")).andExpect(status().isUnauthorized());
  }

  @Test
  void pluginStatusListsLoadedPlugins() throws Exception {
    mockMvc
        .perform(get("/system/plugins").with(httpBasic("developer", "developer")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.id=='storage-file-ro')]").exists())
        .andExpect(jsonPath("$[?(@.id=='query-file-rw')]").exists())
        .andExpect(jsonPath("$[?(@.id=='query-lucene')]").exists());
  }
}
