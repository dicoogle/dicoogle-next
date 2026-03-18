package pt.ua.dicooglenext.dicooglenext.api;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ProblemDetail handleValidationException(
      MethodArgumentNotValidException exception, HttpServletRequest request) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST, "Request validation failed for one or more fields.");
    problem.setType(URI.create("https://dicoogle-next.dev/problems/validation"));
    problem.setTitle("Validation error");
    problem.setProperty(
        "errors",
        exception.getBindingResult().getFieldErrors().stream()
            .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
            .toList());
    addPath(problem, request);
    return problem;
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ProblemDetail handleMethodNotSupported(
      HttpRequestMethodNotSupportedException exception, HttpServletRequest request) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.METHOD_NOT_ALLOWED,
            "HTTP method '%s' is not supported for this endpoint."
                .formatted(exception.getMethod()));
    problem.setType(URI.create("https://dicoogle-next.dev/problems/method-not-allowed"));
    problem.setTitle("Method not allowed");
    addPath(problem, request);
    return problem;
  }

  @ExceptionHandler(IllegalArgumentException.class)
  ProblemDetail handleIllegalArgument(
      IllegalArgumentException exception, HttpServletRequest request) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
    problem.setType(URI.create("https://dicoogle-next.dev/problems/invalid-argument"));
    problem.setTitle("Invalid argument");
    addPath(problem, request);
    return problem;
  }

  @ExceptionHandler(BadCredentialsException.class)
  ProblemDetail handleBadCredentials(
      BadCredentialsException exception, HttpServletRequest request) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.UNAUTHORIZED, "Invalid authentication credentials.");
    problem.setType(URI.create("https://dicoogle-next.dev/problems/authentication"));
    problem.setTitle("Authentication failed");
    addPath(problem, request);
    return problem;
  }

  @ExceptionHandler(AccessDeniedException.class)
  ProblemDetail handleAccessDenied(AccessDeniedException exception, HttpServletRequest request) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.FORBIDDEN, "You are not allowed to access this resource.");
    problem.setType(URI.create("https://dicoogle-next.dev/problems/forbidden"));
    problem.setTitle("Access denied");
    addPath(problem, request);
    return problem;
  }

  @ExceptionHandler(ResponseStatusException.class)
  ProblemDetail handleResponseStatusException(
      ResponseStatusException exception, HttpServletRequest request) {
    HttpStatus status = HttpStatus.valueOf(exception.getStatusCode().value());
    String detail =
        exception.getReason() != null ? exception.getReason() : status.getReasonPhrase();

    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
    problem.setType(URI.create("https://dicoogle-next.dev/problems/http-status"));
    problem.setTitle(status.getReasonPhrase());
    addPath(problem, request);
    return problem;
  }

  @ExceptionHandler(Exception.class)
  ProblemDetail handleGenericException(Exception exception, HttpServletRequest request) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "An unexpected error occurred while processing the request.");
    problem.setType(URI.create("https://dicoogle-next.dev/problems/internal-error"));
    problem.setTitle("Internal server error");
    addPath(problem, request);
    return problem;
  }

  private void addPath(ProblemDetail problem, HttpServletRequest request) {
    problem.setProperty("path", request.getRequestURI());
  }
}
