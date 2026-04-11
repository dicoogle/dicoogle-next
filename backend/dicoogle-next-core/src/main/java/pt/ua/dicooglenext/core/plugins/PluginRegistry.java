package org.dicoogle.core.plugins;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import org.dicoogle.sdk.DicooglePlugin;

public class PluginRegistry {

  private final List<DicooglePlugin> plugins = new ArrayList<>();

  public void register(DicooglePlugin plugin) {
    plugins.add(Objects.requireNonNull(plugin));
  }

  public List<DicooglePlugin> all() {
    return Collections.unmodifiableList(plugins);
  }
}
