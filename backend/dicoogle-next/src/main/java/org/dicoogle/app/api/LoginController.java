package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.dicoogle.app.auth.TokenService;
import org.dicoogle.app.users.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoginController {

  private final UserService userService;
  private final TokenService tokenService;

  public LoginController(UserService userService, TokenService tokenService) {
    this.userService = userService;
    this.tokenService = tokenService;
  }

  @PostMapping("/login")
  @Operation(summary = "Authenticate and receive a bearer token")
  public ResponseEntity<Map<String, Object>> login(
      @RequestParam String username, @RequestParam String password) {
    if (!userService.authenticate(username, password)) {
      return ResponseEntity.status(401)
          .body(Map.of("success", false, "error", "invalid credentials"));
    }
    String token = tokenService.createToken(username);
    var user = userService.findByUsername(username);
    boolean admin = user != null && user.isAdmin();
    List<String> roles = admin ? List.of("admin") : List.of();
    return ResponseEntity.ok(
        Map.of("user", username, "admin", admin, "roles", roles, "token", token));
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
}
