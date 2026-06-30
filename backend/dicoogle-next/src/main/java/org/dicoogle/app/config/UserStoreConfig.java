package org.dicoogle.app.config;

import org.dicoogle.app.users.SeedProperties;
import org.dicoogle.app.users.UserStoreProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({UserStoreProperties.class, SeedProperties.class})
public class UserStoreConfig {}
