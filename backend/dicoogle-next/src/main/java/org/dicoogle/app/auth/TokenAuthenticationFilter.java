package org.dicoogle.app.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Base64;
import org.dicoogle.app.users.UserService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.filter.OncePerRequestFilter;

public class TokenAuthenticationFilter extends OncePerRequestFilter {

  private final TokenService tokenService;
  private final UserService userService;

  public TokenAuthenticationFilter(TokenService tokenService, UserService userService) {
    this.tokenService = tokenService;
    this.userService = userService;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    String header = request.getHeader("Authorization");
    if (header != null && !header.isBlank()) {
      if (header.startsWith("Bearer ")) {
        authenticateWithToken(header.substring(7));
      } else if (header.startsWith("Basic ")) {
        authenticateWithBasic(header.substring(6));
      }
    } else {
      String token = request.getParameter("token");
      if (token != null && !token.isBlank()) {
        authenticateWithToken(token);
      }
    }
    chain.doFilter(request, response);
  }

  private void authenticateWithToken(String token) {
    if (token.isBlank()) {
      return;
    }
    TokenEntry entry = tokenService.validateToken(token);
    if (entry != null) {
      try {
        UserDetails user = userService.loadUserByUsername(entry.getUsername());
        if (user != null && user.isEnabled()) {
          UsernamePasswordAuthenticationToken auth =
              new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
          SecurityContextHolder.getContext().setAuthentication(auth);
        }
      } catch (Exception ignored) {
        // user deleted or disabled — treat as unauthenticated
      }
    }
  }

  private void authenticateWithBasic(String encoded) {
    if (encoded.isBlank()) {
      return;
    }
    try {
      String decoded = new String(Base64.getDecoder().decode(encoded));
      int colon = decoded.indexOf(':');
      if (colon <= 0 || colon >= decoded.length() - 1) {
        return;
      }
      String username = decoded.substring(0, colon);
      String password = decoded.substring(colon + 1);
      if (userService.authenticate(username, password)) {
        UserDetails user = userService.loadUserByUsername(username);
        if (user != null && user.isEnabled()) {
          UsernamePasswordAuthenticationToken auth =
              new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
          SecurityContextHolder.getContext().setAuthentication(auth);
        }
      }
    } catch (Exception ignored) {
      // malformed Basic header — treat as unauthenticated
    }
  }
}
