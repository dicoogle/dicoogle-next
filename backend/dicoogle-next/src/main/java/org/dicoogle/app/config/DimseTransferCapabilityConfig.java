package org.dicoogle.app.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(DimseTransferCapabilityConfigProperties.class)
public class DimseTransferCapabilityConfig {}
