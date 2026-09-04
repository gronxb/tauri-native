cmake_minimum_required(VERSION 3.13)
project(reactnativetauri LANGUAGES CXX)

add_library(
  reactnativetauri
  SHARED
  TauriNativeJni.cpp
)

target_compile_features(reactnativetauri PRIVATE cxx_std_17)
target_link_options(
  reactnativetauri
  PRIVATE
  "-Wl,-z,max-page-size=16384"
)
target_link_libraries(reactnativetauri PRIVATE ${CMAKE_DL_LIBS})
