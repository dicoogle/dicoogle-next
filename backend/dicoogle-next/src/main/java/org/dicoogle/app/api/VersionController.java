package org.dicoogle.app.api;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class VersionController {

  @GetMapping("/ext/version")
  public ResponseEntity<Map<String, String>> version() {
    return ResponseEntity.ok(Map.of("version", "dev"));
  }
}
