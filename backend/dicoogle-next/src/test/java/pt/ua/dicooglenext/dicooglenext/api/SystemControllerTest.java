package pt.ua.dicooglenext.dicooglenext.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
class SystemControllerTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void pingIsPublic() throws Exception {
    mockMvc
        .perform(get("/system/ping"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ok"));
  }

  @Test
  void statusRequiresAuthentication() throws Exception {
    mockMvc.perform(get("/system/status")).andExpect(status().isUnauthorized());
  }

  @Test
  void statusAllowsBasicAuthentication() throws Exception {
    mockMvc
        .perform(get("/system/status").with(httpBasic("developer", "developer")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("dicoogle-next"));
  }

  @Test
  void unsupportedMethodReturnsProblemDetails() throws Exception {
    mockMvc
        .perform(post("/system/ping").with(httpBasic("developer", "developer")))
        .andExpect(status().isMethodNotAllowed())
        .andExpect(content().contentType("application/problem+json"))
        .andExpect(jsonPath("$.title").value("Method not allowed"))
        .andExpect(jsonPath("$.status").value(405))
        .andExpect(
            jsonPath("$.type").value("https://dicoogle-next.dev/problems/method-not-allowed"))
        .andExpect(jsonPath("$.path").value("/system/ping"));
  }
}
