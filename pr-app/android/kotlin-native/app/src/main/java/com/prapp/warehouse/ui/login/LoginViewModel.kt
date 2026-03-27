package com.prapp.warehouse.ui.login

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.prapp.warehouse.data.api.SapApiService
import com.prapp.warehouse.data.api.ServiceGenerator
import com.prapp.warehouse.utils.NetworkResult
import com.prapp.warehouse.utils.SharedPrefsManager
import kotlinx.coroutines.launch

class LoginViewModel(application: Application) : AndroidViewModel(application) {
    private val prefsManager = SharedPrefsManager(application)
    private val _loginResult = MutableLiveData<NetworkResult<Boolean>>()
    val loginResult: LiveData<NetworkResult<Boolean>> = _loginResult

    fun login(serverUrl: String, client: String, username: String, pass: String) {
        if (serverUrl.isBlank() || client.isBlank() || username.isBlank() || pass.isBlank()) {
            _loginResult.value = NetworkResult.Error("Please fill all fields")
            return
        }

        // Save temp details to use in ServiceGenerator
        prefsManager.saveDetails(serverUrl, username, pass, client)

        _loginResult.value = NetworkResult.Loading()

        viewModelScope.launch {
            try {
                val apiService = ServiceGenerator.createService(getApplication(), SapApiService::class.java)
                val response = apiService.validateCredentials(client)

                if (response.isSuccessful) {
                    _loginResult.value = NetworkResult.Success(true)
                } else {
                    _loginResult.value = NetworkResult.Error("Login failed: ${response.code()} ${response.message()}")
                }
            } catch (e: Exception) {
                _loginResult.value = NetworkResult.Error("Error: ${e.message}")
            }
        }
    }
}
