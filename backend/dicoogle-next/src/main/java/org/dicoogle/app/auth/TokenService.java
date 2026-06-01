package org.dicoogle.app.auth;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class TokenService {

  private final ConcurrentHashMap<String, TokenEntry> tokens = new ConcurrentHashMap<>();

  // 1 hour default TTL
  private static final long TTL_SECONDS = 3600;

  public String createToken(String username) {
    String token = UUID.randomUUID().toString();
    tokens.put(token, new TokenEntry(token, username));
    return token;
  }

  public TokenEntry validateToken(String token) {
    TokenEntry entry = tokens.get(token);
    if (entry == null) {
      return null;
    }
    if (entry.getCreatedAt().plusSeconds(TTL_SECONDS).isBefore(Instant.now())) {
      tokens.remove(token);
      return null;
    }
    entry.touch();
    return entry;
  }

  public void revokeToken(String token) {
    tokens.remove(token);
  }

  public int activeTokenCount() {
    return tokens.size();
  }
}
