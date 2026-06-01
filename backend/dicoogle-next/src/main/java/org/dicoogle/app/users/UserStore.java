package org.dicoogle.app.users;

import java.util.List;

public interface UserStore {

  List<UserSettings> load();

  void save(List<UserSettings> users);
}
