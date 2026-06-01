package org.dicoogle.app.auth;

import java.time.Instant;

public class TokenEntry {

  private final String token;
  private final String username;
  private final Instant createdAt;
  private volatile Instant lastUsedAt;

  public TokenEntry(String token, String username) {
    this.token = token;
    this.username = username;
    this.createdAt = Instant.now();
    this.lastUsedAt = this.createdAt;
  }

  public String getToken() {
    return token;
  }

  public String getUsername() {
    return username;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getLastUsedAt() {
    return lastUsedAt;
  }

  public void touch() {
    this.lastUsedAt = Instant.now();
  }
}
