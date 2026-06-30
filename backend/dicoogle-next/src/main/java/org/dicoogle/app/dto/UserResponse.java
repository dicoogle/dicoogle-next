package org.dicoogle.app.dto;

import org.dicoogle.app.users.UserSettings;

public record UserResponse(String username) {
  public static UserResponse from(UserSettings user) {
    return new UserResponse(user.getUsername());
  }
}
