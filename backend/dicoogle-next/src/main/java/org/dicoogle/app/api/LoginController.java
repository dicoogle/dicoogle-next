package org.dicoogle.app.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.dicoogle.app.auth.TokenService;
import org.dicoogle.app.users.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoginController {

  private static final Logger log = LoggerFactory.getLogger(LoginController.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final UserService userService;
  private final TokenService tokenService;

  public LoginController(UserService userService, TokenService tokenService) {
    this.userService = userService;
    this.tokenService = tokenService;
  }

  @PostMapping(value = "/login", consumes = MediaType.ALL_VALUE)
  @Operation(summary = "Authenticate and receive a bearer token")
  public ResponseEntity<Map<String, Object>> login(
      HttpServletRequest request,
      @RequestParam(required = false) String username,
      @RequestParam(required = false) String password) {
    String user = username;
    String pass = password;

    if (isBlank(user) || isBlank(pass)) {
      Map<String, String> body = readJsonBody(request);
      if (body != null) {
        if (isBlank(user)) {
          user = body.get("username");
        }
        if (isBlank(pass)) {
          pass = body.get("password");
        }
      }
    }

    if (isBlank(user) || isBlank(pass)) {
      return ResponseEntity.badRequest()
          .body(Map.of("success", false, "error", "missing username or password"));
    }
    if (!userService.authenticate(user, pass)) {
      return ResponseEntity.status(401)
          .body(Map.of("success", false, "error", "invalid credentials"));
    }
    String token = tokenService.createToken(user);
    var userServiceUser = userService.findByUsername(user);
    boolean admin = userServiceUser != null && userServiceUser.isAdmin();
    List<String> roles = admin ? List.of("admin") : List.of();
    return ResponseEntity.ok(Map.of("user", user, "admin", admin, "roles", roles, "token", token));
  }

  @GetMapping("/login")
  @Operation(summary = "Get current user info from bearer token")
  public ResponseEntity<Map<String, Object>> loginStatus(Authentication auth) {
    if (auth == null || !auth.isAuthenticated()) {
      return ResponseEntity.ok(Map.of("success", false));
    }
    boolean admin =
        auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    return ResponseEntity.ok(
        Map.of(
            "user",
            auth.getName(),
            "admin",
            admin,
            "roles",
            admin ? List.of("admin") : List.of("user")));
  }

  @PostMapping("/logout")
  @Operation(summary = "Invalidate the current bearer token")
  public ResponseEntity<Map<String, Object>> logout(HttpServletRequest request) {
    String header = request.getHeader("Authorization");
    if (header != null && !header.isBlank()) {
      String token = header.startsWith("Bearer ") ? header.substring(7) : header;
      tokenService.revokeToken(token);
    }
    return ResponseEntity.ok(Map.of("success", true));
  }

  @SuppressWarnings("unchecked")
  private Map<String, String> readJsonBody(HttpServletRequest request) {
    String contentType = request.getContentType();
    if (contentType == null || !contentType.contains(MediaType.APPLICATION_JSON_VALUE)) {
      return null;
    }
    try {
      return MAPPER.readValue(request.getInputStream(), Map.class);
    } catch (IOException e) {
      log.debug("Failed to read JSON login body", e);
      return null;
    }
  }

  private static boolean isBlank(String s) {
    return s == null || s.isBlank();
  }
}
