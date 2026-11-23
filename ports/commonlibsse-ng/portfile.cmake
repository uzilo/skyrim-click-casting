vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO alandtse/CommonLibSSE-NG
    REF v9.3.0
    SHA512 3cc9a8c94175de8d4374f2eb3e0e478ca52efbe9a093892854147af453da02223c24f2ef6e2ac10fed7c59e58edc4e6819356f9914e8916284faf378ed3b0018
    HEAD_REF ng
)

vcpkg_cmake_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    PREFER_NINJA
    OPTIONS
        -DBUILD_TESTS=OFF
        -DSKSE_SUPPORT_XBYAK=ON
        -DSKSE_SUPPORT_PATCH_SAFETY=OFF
        -DENABLE_SKYRIM_SE=ON
        -DENABLE_SKYRIM_AE=ON
        -DENABLE_SKYRIM_VR=OFF
)

vcpkg_cmake_install()
vcpkg_cmake_config_fixup(PACKAGE_NAME CommonLibSSE CONFIG_PATH lib/cmake/CommonLibSSE)
vcpkg_copy_pdbs()

if(EXISTS "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSEConfig.cmake")
    vcpkg_replace_string(
        "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSEConfig.cmake"
        "include(\"\${CMAKE_CURRENT_LIST_DIR}/CommonLibSSE-targets.cmake\")"
        "include(CMakeFindDependencyMacro)\nfind_dependency(spdlog CONFIG)\nfind_dependency(directxtk CONFIG)\ninclude(\"\${CMAKE_CURRENT_LIST_DIR}/CommonLibSSE-targets.cmake\")"
    )
endif()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")

if(EXISTS "${SOURCE_PATH}/LICENSE")
    vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")
endif()
