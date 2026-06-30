package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.TreeMap;
import org.dicoogle.app.service.DimseTransferCapabilityService;
import org.dicoogle.app.service.DimseTransferCapabilityStore;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/management/settings/transfer")
public class TransferOptionsController {

  private static final String TS_PREFIX = "1.2.840.10008.1.2";
  private static final String STORAGE_SOP_PREFIX = "1.2.840.10008.5.1.4.1.1";
  private static final String VERIFICATION_UID = "1.2.840.10008.1.1";

  private static final Properties UID_NAMES = loadUidNames();
  private static final Map<String, String> SOP_NAMES = buildSopNames();
  private static final Map<String, String> TS_UID_TO_NAME = buildTsUidToName();
  private static final Map<String, String> TS_NAME_TO_UID = buildTsNameToUid();
  private static final Map<Integer, String> TS_INDEX = buildTsIndex();

  private final DimseTransferCapabilityService service;
  private final DimseTransferCapabilityStore store;

  public TransferOptionsController(
      DimseTransferCapabilityService service, DimseTransferCapabilityStore store) {
    this.service = service;
    this.store = store;
  }

  @GetMapping
  @Operation(
      summary = "List transfer syntax settings (legacy compatible)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<List<Map<String, Object>>> list() {
    DimseTransferCapabilityStore.StoredCapabilities stored = store.load();
    List<DimseCStoreProperties.AcceptedTransferCapability> accepted = stored.capabilities();

    Map<String, List<String>> sopToTs = new LinkedHashMap<>();
    for (DimseCStoreProperties.AcceptedTransferCapability tc : accepted) {
      sopToTs
          .computeIfAbsent(tc.getSopClassUid(), k -> new ArrayList<>())
          .addAll(tc.getTransferSyntaxUids());
    }

    List<Map<String, Object>> result = new ArrayList<>();
    for (Map.Entry<String, String> sopEntry : SOP_NAMES.entrySet()) {
      String sopUid = sopEntry.getKey();
      String sopName = sopEntry.getValue();
      List<String> enabledTs = sopToTs.getOrDefault(sopUid, List.of());

      Map<String, Object> item = new LinkedHashMap<>();
      item.put("uid", sopUid);
      item.put("sop_name", sopName);

      List<Map<String, Object>> options = new ArrayList<>();
      for (Map.Entry<Integer, String> tsEntry : TS_INDEX.entrySet()) {
        Map<String, Object> option = new LinkedHashMap<>();
        option.put("name", tsEntry.getValue());
        option.put("value", enabledTs.contains(TS_NAME_TO_UID.get(tsEntry.getValue())));
        options.add(option);
      }
      item.put("options", options);
      result.add(item);
    }

    return ResponseEntity.ok(result);
  }

  @PostMapping
  @Operation(
      summary = "Update a transfer syntax option for a SOP class",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Boolean>> update(
      @RequestParam("uid") String sopClassUid,
      @RequestParam("option") String option,
      @RequestParam("value") boolean value) {

    String tsUid = TS_NAME_TO_UID.get(option);
    if (tsUid == null) {
      tsUid = option;
    }

    DimseTransferCapabilityStore.StoredCapabilities stored = store.load();
    List<DimseCStoreProperties.AcceptedTransferCapability> accepted =
        new ArrayList<>(stored.capabilities());

    boolean found = false;
    for (DimseCStoreProperties.AcceptedTransferCapability tc : accepted) {
      if (sopClassUid.equals(tc.getSopClassUid())) {
        List<String> tsList = new ArrayList<>(tc.getTransferSyntaxUids());
        if (value && !tsList.contains(tsUid)) {
          tsList.add(tsUid);
        } else if (!value) {
          tsList.remove(tsUid);
        }
        tc.setTransferSyntaxUids(tsList);
        found = true;
        break;
      }
    }

    if (!found && value) {
      DimseCStoreProperties.AcceptedTransferCapability newTc =
          new DimseCStoreProperties.AcceptedTransferCapability(sopClassUid, List.of(tsUid));
      accepted.add(newTc);
    }

    store.save(accepted, stored.version(), "webapp");
    service.applyToServer();

    return ResponseEntity.ok(Map.of("success", true));
  }

  private static Properties loadUidNames() {
    Properties props = new Properties();
    try (InputStream is =
        TransferOptionsController.class
            .getClassLoader()
            .getResourceAsStream("org/dcm4che3/data/UIDNames.properties")) {
      if (is != null) {
        props.load(is);
      }
    } catch (IOException e) {
      // fallback to empty — maps will be empty
    }
    return props;
  }

  private static boolean isTransferSyntax(String uid) {
    return uid.equals(TS_PREFIX) || uid.startsWith(TS_PREFIX + ".");
  }

  private static boolean isStorageSopClass(String uid) {
    return uid.equals(VERIFICATION_UID) || uid.startsWith(STORAGE_SOP_PREFIX);
  }

  private static String cleanName(String raw) {
    return raw.replaceAll("\\(Retired\\)", "").replaceAll("[^a-zA-Z0-9]", "").trim();
  }

  private static Map<String, String> buildSopNames() {
    TreeMap<String, String> sorted = new TreeMap<>();
    for (String uid : UID_NAMES.stringPropertyNames()) {
      String name = UID_NAMES.getProperty(uid);
      if (!isTransferSyntax(uid) && isStorageSopClass(uid) && !name.contains("(Retired)")) {
        sorted.put(uid, cleanName(name));
      }
    }
    return new LinkedHashMap<>(sorted);
  }

  private static Map<String, String> buildTsUidToName() {
    TreeMap<String, String> sorted = new TreeMap<>();
    for (String uid : UID_NAMES.stringPropertyNames()) {
      String name = UID_NAMES.getProperty(uid);
      if (isTransferSyntax(uid) && !name.contains("(Retired)")) {
        sorted.put(uid, cleanName(name));
      }
    }
    return new LinkedHashMap<>(sorted);
  }

  private static Map<String, String> buildTsNameToUid() {
    Map<String, String> m = new LinkedHashMap<>();
    for (Map.Entry<String, String> entry : TS_UID_TO_NAME.entrySet()) {
      m.put(entry.getValue(), entry.getKey());
    }
    return m;
  }

  private static Map<Integer, String> buildTsIndex() {
    List<String> ordered = new ArrayList<>(TS_UID_TO_NAME.values());
    ordered.sort(
        Comparator.comparingInt(TransferOptionsController::tsSortKey)
            .thenComparing(Comparator.naturalOrder()));
    Map<Integer, String> m = new LinkedHashMap<>();
    for (int i = 0; i < ordered.size(); i++) {
      m.put(i, ordered.get(i));
    }
    return m;
  }

  private static int tsSortKey(String name) {
    return switch (name) {
      case "ImplicitVRLittleEndian" -> 0;
      case "ExplicitVRLittleEndian" -> 1;
      case "DeflatedExplicitVRLittleEndian" -> 2;
      case "ExplicitVRBigEndian" -> 3;
      case "JPEGLosslessNonHierarchical14" -> 4;
      case "JPEGLossless" -> 5;
      case "JPEGLSLossless" -> 6;
      case "JPEGLSLossyNearLossless" -> 7;
      case "JPEG2000Lossless" -> 8;
      case "JPEG2000" -> 9;
      case "JPEGBaseline8Bit" -> 10;
      case "JPEGExtended12Bit" -> 11;
      case "RLELossless" -> 12;
      default -> 100;
    };
  }
}
