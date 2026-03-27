package com.prapp.warehouse.data.models

data class ODataListResponse<T>(
    val d: ODataListResult<T>
)

data class ODataListResult<T>(
    val results: List<T>
)

data class ODataV4ListResponse<T>(
    val value: List<T>
)

data class ODataResponse<T>(
    val d: T
)
