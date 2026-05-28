package org.dicoogle.protocol.dicomweb;

import static org.assertj.core.api.Assertions.assertThat;

import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class DicomTagTransformerTest {

  // ---------------------------------------------------------------------------
  // transformResultArray — QIDO-RS hex-tag JSON → flat keyword JSON
  // ---------------------------------------------------------------------------

  private static final String SAMPLE_QIDO_JSON =
      """
      [
        {
          "00100010": { "vr": "PN", "Value": [{ "Alphabetic": "FELIX" }] },
          "00100020": { "vr": "LO", "Value": ["7DfDKDK"] },
          "00100030": { "vr": "DA", "Value": ["19220211"] },
          "0020000D": { "vr": "UI", "Value": ["1.2.840.113745.101000"] },
          "0020000E": { "vr": "UI", "Value": ["1.3.12.2.1107.5.2.13"] },
          "00080060": { "vr": "CS", "Value": ["MR"] },
          "00081030": { "vr": "LO", "Value": ["UCLA Head 3T^Routine"] },
          "0008103E": { "vr": "LO", "Value": ["SUB_MRA"] },
          "00080050": { "vr": "SH", "Value": ["2459413"] },
          "00080018": { "vr": "UI" }
        }
      ]
      """;

  @Nested
  class TransformResultArray {

    @Test
    void mapsKnownTagsToKeywords() {
      String result = DicomTagTransformer.transformResultArray(SAMPLE_QIDO_JSON);

      assertThat(result).contains("\"PatientName\":\"FELIX\"");
      assertThat(result).contains("\"PatientID\":\"7DfDKDK\"");
      assertThat(result).contains("\"PatientBirthDate\":\"19220211\"");
      assertThat(result).contains("\"Modality\":\"MR\"");
      assertThat(result).contains("\"StudyDescription\":\"UCLA Head 3T^Routine\"");
      assertThat(result).contains("\"SeriesDescription\":\"SUB_MRA\"");
      assertThat(result).contains("\"AccessionNumber\":\"2459413\"");
      assertThat(result).contains("\"StudyInstanceUID\":\"1.2.840.113745.101000\"");
      assertThat(result).contains("\"SeriesInstanceUID\":\"1.3.12.2.1107.5.2.13\"");
    }

    @Test
    void handlesAbsentValueArray() {
      // SOPInstanceUID (00080018) has no Value — should map to null without throwing
      String result = DicomTagTransformer.transformResultArray(SAMPLE_QIDO_JSON);
      assertThat(result).contains("\"SOPInstanceUID\":null");
    }

    @Test
    void returnsJsonArray() {
      String result = DicomTagTransformer.transformResultArray(SAMPLE_QIDO_JSON);
      assertThat(result.trim()).startsWith("[").endsWith("]");
    }

    @Test
    void emptyInputArrayReturnsEmptyArray() {
      String result = DicomTagTransformer.transformResultArray("[]");
      assertThat(result).isEqualTo("[]");
    }

    @Test
    void multipleItemsAreAllTransformed() {
      String twoItems =
          """
          [
            { "00100010": { "vr": "PN", "Value": [{ "Alphabetic": "ALICE" }] } },
            { "00100010": { "vr": "PN", "Value": [{ "Alphabetic": "BOB" }] } }
          ]
          """;
      String result = DicomTagTransformer.transformResultArray(twoItems);
      assertThat(result).contains("\"PatientName\":\"ALICE\"");
      assertThat(result).contains("\"PatientName\":\"BOB\"");
    }
  }

  // ---------------------------------------------------------------------------
  // resolveKeyword — hex tag string → DICOM keyword via ElementDictionary
  // ---------------------------------------------------------------------------

  @Nested
  class ResolveKeyword {

    @Test
    void knownTagResolvesToKeyword() {
      assertThat(DicomTagTransformer.resolveKeyword("00100010")).isEqualTo("PatientName");
      assertThat(DicomTagTransformer.resolveKeyword("0020000D")).isEqualTo("StudyInstanceUID");
      assertThat(DicomTagTransformer.resolveKeyword("00080060")).isEqualTo("Modality");
    }

    @Test
    void unknownPrivateTagFallsBackToUppercaseHex() {
      // 00091010 is a private tag — not in the standard dictionary
      String result = DicomTagTransformer.resolveKeyword("00091010");
      assertThat(result).isEqualTo("00091010".toUpperCase());
    }

    @Test
    void invalidHexFallsBackToUppercaseInput() {
      assertThat(DicomTagTransformer.resolveKeyword("GGGGGGGG")).isEqualTo("GGGGGGGG");
    }
  }

  // ---------------------------------------------------------------------------
  // toDumpResponse — dcm4che Attributes → flat keyword→value JSON object
  // ---------------------------------------------------------------------------

  @Nested
  class ToDumpResponse {

    @Test
    void mapsAllKnownTags() {
      Attributes attrs = new Attributes();
      attrs.setString(Tag.SOPInstanceUID, VR.UI, "1.2.3.4.5");
      attrs.setString(Tag.PatientName, VR.PN, "FELIX");
      attrs.setString(Tag.Modality, VR.CS, "MR");
      attrs.setString(Tag.StudyDate, VR.DA, "20050422");
      attrs.setString(Tag.SeriesDescription, VR.LO, "SUB_MRA");

      String result = DicomTagTransformer.toDumpResponse(attrs);

      assertThat(result).contains("\"SOPInstanceUID\":\"1.2.3.4.5\"");
      assertThat(result).contains("\"PatientName\":\"FELIX\"");
      assertThat(result).contains("\"Modality\":\"MR\"");
      assertThat(result).contains("\"StudyDate\":\"20050422\"");
      assertThat(result).contains("\"SeriesDescription\":\"SUB_MRA\"");
    }

    @Test
    void pixelDataIsExcluded() {
      Attributes attrs = new Attributes();
      attrs.setString(Tag.SOPInstanceUID, VR.UI, "1.2.3");
      attrs.setBytes(Tag.PixelData, VR.OB, new byte[] {0x00, 0x01});

      String result = DicomTagTransformer.toDumpResponse(attrs);

      assertThat(result).doesNotContain("PixelData");
      assertThat(result).doesNotContain("7FE00010");
    }

    @Test
    void sequenceTagsAreExcluded() {
      Attributes attrs = new Attributes();
      attrs.setString(Tag.PatientID, VR.LO, "ABC123");
      // Tag.RequestAttributesSequence (00400275) is SQ — should be skipped
      attrs.newSequence(Tag.RequestAttributesSequence, 1);

      String result = DicomTagTransformer.toDumpResponse(attrs);

      assertThat(result).contains("\"PatientID\":\"ABC123\"");
      assertThat(result).doesNotContain("RequestAttributesSequence");
    }

    @Test
    void privateTagFallsBackToHex() {
      Attributes attrs = new Attributes();
      // Use a tag in the private data range (element > 0x00FF) that dcm4che doesn't know.
      // Elements 0x0010-0x00FF in private groups are PrivateCreatorID in dcm4che.
      attrs.setString(0x00091001, VR.LO, "private-value");

      String result = DicomTagTransformer.toDumpResponse(attrs);

      // Key should be the hex tag in uppercase since it's not in the standard dictionary
      assertThat(result).contains("private-value");
      // The key must be the hex string, not an empty string or null
      assertThat(result).containsPattern("\"[0-9A-F]{8}\":\"private-value\"");
    }

    @Test
    void emptyAttributesReturnsEmptyObject() {
      String result = DicomTagTransformer.toDumpResponse(new Attributes());
      assertThat(result.trim()).isEqualTo("{}");
    }

    @Test
    void returnsJsonObject() {
      Attributes attrs = new Attributes();
      attrs.setString(Tag.Modality, VR.CS, "CT");

      String result = DicomTagTransformer.toDumpResponse(attrs);

      assertThat(result.trim()).startsWith("{").endsWith("}");
    }
  }
}
