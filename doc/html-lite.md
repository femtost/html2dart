# HTML-lite

This Html2Dart lib converts a subset of HTML to Dart code using Flutter 
widgets. It is HTML-lite and not full HTML specification.


# Specifications

## Text

Text inside an HTML tag:
  - Default is literal
  - Use `$(...)` to evaluate a Dart expression


## Attributes

Literal always
  - Many tag attributes are literal always

Dart-code always
  - Many tag attributes are Dart-code always
    eg. `if=`, `foreach=`...

Literal by default, optional Dart-code
  - `img src="literal"`, or `img src="$(...)"`

Attributes of tag with 'dart-class' attribute
  - They're literal by default
  - Use `$(...)` to specify Dart code

_____________  