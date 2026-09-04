cmake_minimum_required(VERSION 3.22.1)
project(taurinativelynx LANGUAGES CXX)

add_library(
  taurinativelynx
  SHARED
  TauriNativeJni.cpp
)

target_compile_features(taurinativelynx PRIVATE cxx_std_17)
target_link_libraries(taurinativelynx PRIVATE dl)
target_link_options(
  taurinativelynx
  PRIVATE
  "-Wl,-z,max-page-size=16384"
  "-Wl,-z,common-page-size=16384"
)
