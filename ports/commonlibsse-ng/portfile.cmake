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
        -DENABLE_SKYRIM_SE=ON
        -DENABLE_SKYRIM_AE=ON
        -DENABLE_SKYRIM_VR=ON
)

vcpkg_cmake_install()
vcpkg_cmake_config_fixup(PACKAGE_NAME CommonLibSSE CONFIG_PATH lib/cmake)
vcpkg_copy_pdbs()

file(GLOB CMAKE_CONFIGS "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSE/*.cmake")
if(CMAKE_CONFIGS)
    file(INSTALL ${CMAKE_CONFIGS} DESTINATION "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE")
endif()
if(EXISTS "${SOURCE_PATH}/cmake/CommonLibSSE.cmake")
    file(INSTALL "${SOURCE_PATH}/cmake/CommonLibSSE.cmake" DESTINATION "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE")
endif()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")
if(EXISTS "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSE")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSE")
endif()

if(EXISTS "${SOURCE_PATH}/LICENSE")
    vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")
endif()
