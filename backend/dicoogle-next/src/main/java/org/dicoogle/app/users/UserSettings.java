package org.dicoogle.app.users;

import java.util.ArrayList;
import java.util.List;

public class UserSettings {

  private String username;
  private String passwordHash;
  private boolean admin;
  private List<String> roles = new ArrayList<>();
  private boolean enabled = true;

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public boolean isAdmin() {
    return admin;
  }

  public void setAdmin(boolean admin) {
    this.admin = admin;
  }

  public List<String> getRoles() {
    return roles;
  }

  public void setRoles(List<String> roles) {
    this.roles = roles == null ? new ArrayList<>() : new ArrayList<>(roles);
  }

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }
}
