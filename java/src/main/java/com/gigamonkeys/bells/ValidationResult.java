package com.gigamonkeys.bells;

import java.util.List;

/**
 * The outcome of validating calendar data: whether it is valid, plus any error and
 * warning messages.
 *
 * @param valid whether the data passed validation (no errors)
 * @param errors error messages (data is invalid if non-empty)
 * @param warnings warning messages (do not make the data invalid)
 */
public record ValidationResult(boolean valid, List<String> errors, List<String> warnings) {}
