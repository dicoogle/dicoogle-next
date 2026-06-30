package org.dicoogle.app.config;

import org.dicoogle.app.settings.RuntimeSettingsProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(RuntimeSettingsProperties.class)
public class RuntimeSettingsConfig {}
