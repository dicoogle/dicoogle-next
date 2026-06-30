package org.dicoogle.app.users;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserService implements UserDetailsService {

  private static final Logger log = LoggerFactory.getLogger(UserService.class);

  private final UserStore store;
  private final PasswordEncoder passwordEncoder;
  private final AtomicReference<List<UserSettings>> cached = new AtomicReference<>(List.of());
  private final SeedProperties seed;

  public UserService(UserStore store, PasswordEncoder passwordEncoder, SeedProperties seed) {
    this.store = store;
    this.passwordEncoder = passwordEncoder;
    this.seed = seed;
    init();
  }

  private void init() {
    List<UserSettings> users = store.load();
    if (users.isEmpty() && seed.getUsername() != null && seed.getPassword() != null) {
      UserSettings admin = new UserSettings();
      admin.setUsername(seed.getUsername());
      admin.setPasswordHash(passwordEncoder.encode(seed.getPassword()));
      admin.setAdmin(true);
      admin.setRoles(List.of("admin"));
      admin.setEnabled(true);
      users = new ArrayList<>(List.of(admin));
      store.save(users);
      log.info("Seeded default admin user: {}", seed.getUsername());
    }
    cached.set(users);
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    for (UserSettings user : cached.get()) {
      if (user.getUsername().equals(username)) {
        return User.withUsername(user.getUsername())
            .password(user.getPasswordHash())
            .disabled(!user.isEnabled())
            .roles(user.isAdmin() ? "ADMIN" : "USER")
            .build();
      }
    }
    throw new UsernameNotFoundException("User not found: " + username);
  }

  public List<UserSettings> listUsers() {
    return Collections.unmodifiableList(cached.get());
  }

  public UserSettings findByUsername(String username) {
    for (UserSettings user : cached.get()) {
      if (user.getUsername().equals(username)) {
        return user;
      }
    }
    return null;
  }

  public boolean authenticate(String username, String password) {
    UserSettings user = findByUsername(username);
    if (user == null || !user.isEnabled()) {
      return false;
    }
    return passwordEncoder.matches(password, user.getPasswordHash());
  }

  public synchronized UserSettings createUser(String username, String password, boolean admin) {
    if (username == null || username.isBlank()) {
      throw new IllegalArgumentException("username must not be empty");
    }
    if (password == null || password.length() < 4) {
      throw new IllegalArgumentException("password must be at least 4 characters");
    }
    for (UserSettings existing : cached.get()) {
      if (existing.getUsername().equals(username)) {
        throw new IllegalArgumentException("user already exists: " + username);
      }
    }
    UserSettings user = new UserSettings();
    user.setUsername(username.trim());
    user.setPasswordHash(passwordEncoder.encode(password));
    user.setAdmin(admin);
    user.setRoles(admin ? List.of("admin") : List.of("user"));
    user.setEnabled(true);

    List<UserSettings> updated = new ArrayList<>(cached.get());
    updated.add(user);
    store.save(updated);
    cached.set(updated);
    return user;
  }

  public synchronized void deleteUser(String username) {
    if (username == null || username.isBlank()) {
      throw new IllegalArgumentException("username must not be empty");
    }
    List<UserSettings> updated = new ArrayList<>(cached.get());
    boolean removed = updated.removeIf(u -> u.getUsername().equals(username));
    if (!removed) {
      throw new IllegalArgumentException("user not found: " + username);
    }
    store.save(updated);
    cached.set(updated);
  }
}
