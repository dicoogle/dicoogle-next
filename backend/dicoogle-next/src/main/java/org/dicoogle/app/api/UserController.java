package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.List;
import java.util.Map;
import org.dicoogle.app.dto.UserResponse;
import org.dicoogle.app.users.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/user")
public class UserController {

  private final UserService userService;

  public UserController(UserService userService) {
    this.userService = userService;
  }

  @GetMapping
  @Operation(summary = "List all users", security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, List<UserResponse>>> list() {
    List<UserResponse> users = userService.listUsers().stream().map(UserResponse::from).toList();
    return ResponseEntity.ok(Map.of("users", users));
  }

  @PostMapping
  @Operation(summary = "Create a user", security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, Object>> create(
      @RequestParam String username,
      @RequestParam String password,
      @RequestParam(required = false, defaultValue = "false") boolean admin) {
    userService.createUser(username, password, admin);
    return ResponseEntity.ok(Map.of("success", true));
  }

  @DeleteMapping("/{username}")
  @Operation(summary = "Delete a user", security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, Object>> delete(@PathVariable String username) {
    userService.deleteUser(username);
    return ResponseEntity.ok(Map.of("success", true));
  }
}
