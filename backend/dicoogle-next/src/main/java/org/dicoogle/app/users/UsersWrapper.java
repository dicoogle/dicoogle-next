package org.dicoogle.app.users;

import java.util.ArrayList;
import java.util.List;

public class UsersWrapper {

  private List<UserSettings> users = new ArrayList<>();

  public List<UserSettings> getUsers() {
    return users;
  }

  public void setUsers(List<UserSettings> users) {
    this.users = users == null ? new ArrayList<>() : new ArrayList<>(users);
  }
}
