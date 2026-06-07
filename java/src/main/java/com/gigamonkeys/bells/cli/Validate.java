package com.gigamonkeys.bells.cli;

import com.gigamonkeys.bells.ValidationResult;
import com.gigamonkeys.bells.Validator;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Command-line entry point for validating calendar JSON files.
 *
 * <p>Usage: {@code bells-validate <calendar.json> [file2.json ...]}
 */
public final class Validate {

  private Validate() {}

  /**
   * @param args one or more paths to calendar JSON files
   */
  public static void main(String[] args) {
    if (args.length == 0) {
      System.err.println("Usage: bells-validate <calendar.json> [file2.json ...]");
      System.exit(1);
      return;
    }

    boolean anyErrors = false;

    for (String filePath : args) {
      String text;
      try {
        text = Files.readString(Path.of(filePath), StandardCharsets.UTF_8);
      } catch (IOException e) {
        System.err.println("Error reading " + filePath + ": " + e.getMessage());
        anyErrors = true;
        continue;
      }

      ValidationResult result;
      try {
        result = Validator.validateJson(text);
      } catch (RuntimeException e) {
        System.err.println("Error reading " + filePath + ": " + e.getMessage());
        anyErrors = true;
        continue;
      }

      int warningCount = result.warnings().size();
      if (result.valid() && warningCount == 0) {
        System.out.println(filePath + ": valid");
      } else if (result.valid()) {
        System.out.println(
            filePath + ": valid (" + warningCount + " warning" + (warningCount == 1 ? "" : "s") + ")");
      } else {
        anyErrors = true;
        int errorCount = result.errors().size();
        System.err.println(
            filePath + ": Found " + errorCount + " error" + (errorCount == 1 ? "" : "s") + ":");
        for (String err : result.errors()) {
          System.err.println("  - " + err);
        }
      }
      for (String w : result.warnings()) {
        System.err.println("  warning: " + w);
      }
    }

    System.exit(anyErrors ? 1 : 0);
  }
}
