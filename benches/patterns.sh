#!/bin/bash
# Benchmark patterns for testing globlin performance
# These patterns test various complexity levels and edge cases

# Common patterns used in real projects
patterns=(
  # Simple patterns
  '*.js'
  '*.ts'
  '*.txt'
  
  # Recursive patterns (most common)
  '**/*.js'
  '**/*.ts'
  '**/*.txt'
  
  # Scoped recursive patterns
  'level0/**/*.js'
  '**/level1/**/*.ts'
  
  # Multiple globstars
  '**/*/**/*.js'
  
  # Brace expansion
  '**/*.{js,ts}'
  'level{0,1}/**/*.js'
  
  # Character classes
  '**/*[0-9].js'
  '**/file[0-9][0-9].ts'
  
  # Question mark wildcards
  '**/file?.js'
  '**/level?/**/*.ts'
  
  # Complex patterns from glob's test suite
  '**'
  './**/*.txt'
  '**/level*/**/*.js'
  
  # Pathological patterns (stress tests)
  './**/level0/**/level1/**/*.js'
  '**/*/**/*/**/*.js'
)
