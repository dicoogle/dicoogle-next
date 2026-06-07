package org.dicoogle.app.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
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
    String token = null;
    if (header != null && !header.isBlank()) {
      token = header.startsWith("Bearer ") ? header.substring(7) : header;
    } else {
      token = request.getParameter("token");
    }
    if (token != null && !token.isBlank()) {
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
    chain.doFilter(request, response);
  }
}
