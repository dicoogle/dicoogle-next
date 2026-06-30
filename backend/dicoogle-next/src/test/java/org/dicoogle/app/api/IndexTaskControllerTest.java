package org.dicoogle.app.api;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class IndexTaskControllerTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void listTasksRequiresAuthentication() throws Exception {
    mockMvc.perform(get("/index/task")).andExpect(status().isUnauthorized());
  }

  @Test
  void listTasksReturnsResultsWrapper() throws Exception {
    mockMvc
        .perform(get("/index/task").with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results").isArray())
        .andExpect(jsonPath("$.count").isNumber());
  }

  @Test
  void postRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/index/task")).andExpect(status().isUnauthorized());
  }

  @Test
  void postRejectsUnknownAction() throws Exception {
    mockMvc
        .perform(
            post("/index/task")
                .with(user("dicoogle").roles("ADMIN"))
                .param("action", "unknown")
                .param("type", "close")
                .param("uid", "any"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("action param needed: only delete is supported"));
  }

  @Test
  void postRejectsUnknownType() throws Exception {
    mockMvc
        .perform(
            post("/index/task")
                .with(user("dicoogle").roles("ADMIN"))
                .param("action", "delete")
                .param("type", "unknown")
                .param("uid", "any"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("unknown type: unknown"));
  }

  @Test
  void postCloseReturnsFalseForMissingUid() throws Exception {
    mockMvc
        .perform(
            post("/index/task")
                .with(user("dicoogle").roles("ADMIN"))
                .param("action", "delete")
                .param("type", "close")
                .param("uid", "nonexistent"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.removed").value(false));
  }

  @Test
  void postStopReturnsFalseForMissingUid() throws Exception {
    mockMvc
        .perform(
            post("/index/task")
                .with(user("dicoogle").roles("ADMIN"))
                .param("action", "delete")
                .param("type", "stop")
                .param("uid", "nonexistent"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.stopped").value(false));
  }

  @Test
  void reindexCreatesTaskThatAppearsInListing() throws Exception {
    String taskUid =
        mockMvc
            .perform(post("/system/index/reindex").with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.taskUid", notNullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();

    mockMvc
        .perform(get("/index/task").with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].taskUid").exists());
  }

  @Test
  void reindexReturnsTaskUid() throws Exception {
    mockMvc
        .perform(post("/system/index/reindex").with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.taskUid").isString());
  }

  @Test
  void indexPathsRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/system/index/index")).andExpect(status().isUnauthorized());
  }

  @Test
  void unindexPathsRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/system/index/unindex")).andExpect(status().isUnauthorized());
  }
}
