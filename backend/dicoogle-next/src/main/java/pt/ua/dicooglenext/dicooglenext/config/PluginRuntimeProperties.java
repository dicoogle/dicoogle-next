package org.dicoogle.app.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.plugins")
public class PluginRuntimeProperties {

  private final StartupValidation startupValidation = new StartupValidation();
  private final Storage storage = new Storage();

  public StartupValidation getStartupValidation() {
    return startupValidation;
  }

  public Storage getStorage() {
    return storage;
  }

  public static class StartupValidation {

    private boolean requireWritableProvider;
    private String writableScheme = "file";

    public boolean isRequireWritableProvider() {
      return requireWritableProvider;
    }

    public void setRequireWritableProvider(boolean requireWritableProvider) {
      this.requireWritableProvider = requireWritableProvider;
    }

    public String getWritableScheme() {
      return writableScheme;
    }

    public void setWritableScheme(String writableScheme) {
      this.writableScheme = writableScheme;
    }
  }

  public static class Storage {

    private String primaryScheme = "file";
    private List<String> enabledSchemes = new ArrayList<>();
    private List<String> disabledSchemes = new ArrayList<>();

    public String getPrimaryScheme() {
      return primaryScheme;
    }

    public void setPrimaryScheme(String primaryScheme) {
      this.primaryScheme = primaryScheme;
    }

    public List<String> getEnabledSchemes() {
      return enabledSchemes;
    }

    public void setEnabledSchemes(List<String> enabledSchemes) {
      this.enabledSchemes = enabledSchemes;
    }

    public List<String> getDisabledSchemes() {
      return disabledSchemes;
    }

    public void setDisabledSchemes(List<String> disabledSchemes) {
      this.disabledSchemes = disabledSchemes;
    }
  }
}
