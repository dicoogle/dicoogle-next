package org.dicoogle.app.api;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import org.dicoogle.app.testing.fixtures.SyntheticDicomFixtureGenerator;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.protocol.dicomweb.NativeFrameLimits;
import org.dicoogle.protocol.dicomweb.NativeFrameService;
import org.dicoogle.sdk.storage.DicomInstanceLocator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@DirtiesContext
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(NativeFrameControllerLimitTest.SmallLimits.class)
class NativeFrameControllerLimitTest {

  @Autowired private MockMvc mockMvc;

  @TempDir Path tempDirectory;

  @BeforeEach
  void setUp() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);
    SyntheticDicomFixtureGenerator.GeneratedInstance instance = fixture.instances().getFirst();
    Path path =
        Path.of("target/test-storage/wado")
            .resolve("PATIENT-LIMIT")
            .resolve(SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID)
            .resolve(instance.seriesInstanceUID())
            .resolve(instance.sopInstanceUID() + ".dcm");
    Files.createDirectories(path.getParent());
    Files.copy(instance.path(), path, StandardCopyOption.REPLACE_EXISTING);
  }

  @Test
  void responseLimitReturns413WithoutMultipartBody() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get("/dicom-web/studies/"
                        + SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID
                        + "/series/"
                        + SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID
                        + "/instances/"
                        + SyntheticDicomFixtureGenerator.INSTANCE_A_UID
                        + "/frames/1")
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isPayloadTooLarge())
            .andReturn();

    String contentType = result.getResponse().getContentType();
    if (contentType != null) {
      assertFalse(contentType.toLowerCase().contains("multipart/related"));
    }
    assertFalse(result.getResponse().getContentAsString().contains("X-Frame-Number"));
  }

  @TestConfiguration
  static class SmallLimits {

    @Bean
    @Primary
    NativeFrameService smallLimitNativeFrameService(
        List<DicomInstanceLocator> locators,
        StorageRouter storageRouter,
        MeterRegistry meterRegistry) {
      return new NativeFrameService(
          locators,
          storageRouter,
          meterRegistry,
          new NativeFrameLimits(64L * 1024 * 1024, 16L * 1024 * 1024, 100, 8));
    }
  }
}
