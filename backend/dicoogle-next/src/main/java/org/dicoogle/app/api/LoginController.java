package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoginController {

  @GetMapping("/login")
  @Operation(summary = "Get current user info", security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, Object>> loginStatus(Authentication auth) {
    if (auth == null || !auth.isAuthenticated()) {
      return ResponseEntity.ok(Map.of("success", false));
    }
    boolean admin =
        auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    return ResponseEntity.ok(
        Map.of(
            "success",
            true,
            "user",
            auth.getName(),
            "admin",
            admin,
            "roles",
            auth.getAuthorities().stream().map(Object::toString).toList()));
  }

  @PostMapping("/login")
  @Operation(
      summary = "Authenticate (validates credentials)",
      security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, Object>> login(Authentication auth) {
    if (auth == null || !auth.isAuthenticated()) {
      return ResponseEntity.status(401)
          .body(Map.of("success", false, "error", "invalid credentials"));
    }
    boolean admin =
        auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    return ResponseEntity.ok(Map.of("success", true, "user", auth.getName(), "admin", admin));
  }

  @PostMapping("/logout")
  @Operation(
      summary = "Logout (no-op with basic auth)",
      security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, Object>> logout() {
    return ResponseEntity.ok(Map.of("success", true));
  }
}
