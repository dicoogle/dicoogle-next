package org.dicoogle.app.config;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

  private static final String[] DOCS_ENDPOINTS = {
    "/v3/api-docs/**", "/v3/api-docs.yaml", "/swagger-ui.html", "/swagger-ui/**"
  };

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityProperties properties)
      throws Exception {
    var authorize =
        http.csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(
                requests -> {
                  requests
                      .requestMatchers(HttpMethod.GET, "/system/ping")
                      .permitAll()
                      .requestMatchers(HttpMethod.GET, "/system/index/status")
                      .authenticated()
                      .requestMatchers(HttpMethod.POST, "/system/index/reindex")
                      .authenticated()
                      .requestMatchers(HttpMethod.POST, "/system/index/index")
                      .authenticated()
                      .requestMatchers(HttpMethod.POST, "/system/index/unindex")
                      .authenticated()
                      .requestMatchers(HttpMethod.GET, "/system/config/dimse/transfer-capabilities")
                      .authenticated()
                      .requestMatchers(
                          HttpMethod.PUT, "/system/config/dimse/transfer-capabilities/**")
                      .authenticated()
                      .requestMatchers(
                          HttpMethod.DELETE, "/system/config/dimse/transfer-capabilities/**")
                      .authenticated()
                      .requestMatchers(
                          HttpMethod.POST, "/system/config/dimse/transfer-capabilities/replace")
                      .authenticated()
                      .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/info")
                      .permitAll();
                  requests.requestMatchers(HttpMethod.GET, "/dicom-web/**").authenticated();
                  if (properties.isDocsEnabled()) {
                    requests.requestMatchers(DOCS_ENDPOINTS).permitAll();
                  }
                  requests.anyRequest().authenticated();
                })
            .httpBasic(Customizer.withDefaults());

    return authorize.build();
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(SecurityProperties properties) {
    var configuration = new CorsConfiguration();
    var origins = properties.getAllowedOrigins();
    if (origins == null || origins.isEmpty()) {
      configuration.addAllowedOriginPattern("*");
    } else {
      configuration.setAllowedOrigins(origins);
    }
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(true);

    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  @Bean
  UserDetailsService userDetailsService(
      PasswordEncoder passwordEncoder, SecurityProperties properties) {
    String username = properties.getBasicAuth().getUsername();
    String password = properties.getBasicAuth().getPassword();

    if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
      throw new IllegalStateException(
          "Missing basic auth credentials. Configure app.security.basic-auth.username and "
              + "app.security.basic-auth.password for the active profile.");
    }

    UserDetails developer =
        User.withUsername(username)
            .password(passwordEncoder.encode(password))
            .roles("DEVELOPER")
            .build();
    return new InMemoryUserDetailsManager(developer);
  }

  @Bean
  PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
  }
}
