package org.dicoogle.protocol.dicomweb;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.ElementDictionary;
import org.dcm4che3.data.VR;

/**
 * Transforms DICOM data into UI-friendly JSON shapes.
 *
 * <p>Uses dcm4che's {@link ElementDictionary} for the canonical tag→keyword mapping, giving full
 * coverage of all DICOM PS3.6 standard data elements without any hardcoded dictionary.
 *
 * <p>Two output modes:
 *
 * <ol>
 *   <li>{@link #transformResultArray(String)} — converts QIDO-RS hex-tag JSON to a flat keyword
 *       JSON array (for {@code /DICOMWeb/Studies}, {@code /Series}, {@code /Instances}).
 *   <li>{@link #toDumpResponse(Attributes)} — converts a fully parsed dcm4che {@link Attributes}
 *       object to a flat keyword→value JSON object (for {@code /dump}).
 * </ol>
 *
 * <p>Example input for {@code transformResultArray} (QIDO-RS standard):
 *
 * <pre>{@code
 * { "00100010": { "vr": "PN", "Value": [{ "Alphabetic": "FELIX" }] } }
 * }</pre>
 *
 * <p>Example output:
 *
 * <pre>{@code
 * { "PatientName": "FELIX" }
 * }</pre>
 */
public final class DicomTagTransformer {

  /** DICOM tag for pixel data — always excluded from dump output. */
  private static final int TAG_PIXEL_DATA = 0x7FE00010;

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private DicomTagTransformer() {}

  // ---------------------------------------------------------------------------
  // QIDO-RS hex-tag JSON → flat keyword JSON
  // ---------------------------------------------------------------------------

  /**
   * Transforms a DICOM JSON array string (list of QIDO-RS results) into a flat keyword JSON array
   * string compatible with the legacy Dicoogle UI.
   *
   * @param dicomJson a JSON array of DICOM PS3.18 objects (hex-tag keyed)
   * @return a JSON array of flat keyword-keyed objects
   */
  public static String transformResultArray(String dicomJson) {
    try {
      JsonNode root = MAPPER.readTree(dicomJson);
      ArrayNode out = MAPPER.createArrayNode();
      if (root.isArray()) {
        for (JsonNode item : root) {
          out.add(transformSingleResult(item));
        }
      }
      return MAPPER.writeValueAsString(out);
    } catch (Exception e) {
      throw new RuntimeException("Failed to transform DICOM JSON to keyword JSON", e);
    }
  }

  private static ObjectNode transformSingleResult(JsonNode dicomItem) {
    ObjectNode result = MAPPER.createObjectNode();
    dicomItem
        .fields()
        .forEachRemaining(
            entry -> {
              String keyword = resolveKeyword(entry.getKey());
              result.put(keyword, extractValue(entry.getValue()));
            });
    return result;
  }

  /**
   * Resolves a DICOM hex tag string (e.g. {@code "00100010"}) to its DICOM keyword (e.g. {@code
   * "PatientName"}) using dcm4che's {@link ElementDictionary}. Falls back to the uppercase hex tag
   * for unknown/private tags.
   */
  static String resolveKeyword(String hexTag) {
    try {
      int tag = (int) Long.parseLong(hexTag, 16);
      String keyword = ElementDictionary.keywordOf(tag, null);
      return (keyword != null && !keyword.isEmpty()) ? keyword : hexTag.toUpperCase();
    } catch (NumberFormatException e) {
      return hexTag.toUpperCase();
    }
  }

  /**
   * Extracts a scalar string value from a DICOM tag node. Handles PN (PersonName with Alphabetic
   * component), and all other scalar VRs (DA, TM, UI, LO, SH, CS, IS, DS, etc.).
   */
  static String extractValue(JsonNode tagNode) {
    JsonNode valueArray = tagNode.get("Value");
    if (valueArray == null || !valueArray.isArray() || valueArray.isEmpty()) {
      return null;
    }
    JsonNode first = valueArray.get(0);
    if (first.isObject()) {
      // PersonName (PN vr) — use Alphabetic component if present
      JsonNode alphabetic = first.get("Alphabetic");
      return alphabetic != null ? alphabetic.asText() : first.toString();
    }
    return first.asText();
  }

  // ---------------------------------------------------------------------------
  // /dump — dcm4che Attributes → full flat keyword→value JSON object
  // ---------------------------------------------------------------------------

  /**
   * Converts a fully parsed dcm4che {@link Attributes} object into a flat JSON object suitable for
   * the {@code /dump} endpoint.
   *
   * <p>Every tag present in the dataset is emitted. The key is the DICOM keyword (e.g. {@code
   * "PatientName"}) when available from the standard dictionary via {@link
   * ElementDictionary#keywordOf}, or the zero-padded uppercase hex tag (e.g. {@code "00091010"})
   * for private/unknown tags. Sequence (SQ) tags and pixel data ({@code 7FE00010}) are always
   * excluded.
   *
   * <p>Example output:
   *
   * <pre>{@code
   * {
   *   "SOPInstanceUID": "1.2.3...",
   *   "PatientName": "FELIX",
   *   "Modality": "MR",
   *   ...
   * }
   * }</pre>
   *
   * @param attrs the fully parsed DICOM dataset
   * @return a JSON object string with one entry per non-SQ, non-pixel-data tag
   */
  public static String toDumpResponse(Attributes attrs) {
    try {
      ObjectNode result = MAPPER.createObjectNode();
      for (int tag : attrs.tags()) {
        // Pixel data is binary — not useful for a metadata dump
        if (tag == TAG_PIXEL_DATA) {
          continue;
        }
        VR vr = attrs.getVR(tag);
        // Sequences contain nested Attributes — skip for now; they are rarely
        // needed by UI consumers of /dump and would require recursive handling
        if (vr == VR.SQ) {
          continue;
        }
        // Use dcm4che's dictionary for the keyword; fall back to hex for private tags
        String keyword = ElementDictionary.keywordOf(tag, null);
        String key = (keyword != null && !keyword.isBlank()) ? keyword : String.format("%08X", tag);

        String value = attrs.getString(tag, (String) null);
        result.put(key, value);
      }
      return MAPPER.writeValueAsString(result);
    } catch (Exception e) {
      throw new RuntimeException("Failed to build dump response", e);
    }
  }
}
