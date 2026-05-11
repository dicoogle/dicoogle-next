package org.dicoogle.query.lucene;

import java.util.Locale;

final class LuceneValueNormalizer {

  private LuceneValueNormalizer() {}

  static String nullToEmpty(String value) {
    return value == null ? "" : value;
  }

  static String normalizeForFuzzy(String value) {
    if (value == null) {
      return "";
    }
    StringBuilder out = new StringBuilder(value.length());
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (Character.isLetterOrDigit(c)) {
        out.append(Character.toLowerCase(c));
      }
    }
    return out.toString();
  }

  static String lower(String value) {
    return value == null ? "" : value.toLowerCase(Locale.ROOT);
  }
}
