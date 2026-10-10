<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ComputerController;
use App\Http\Controllers\GateVerificationController;

Route::prefix('auth')->middleware('throttle:10,1')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::delete('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/devices', [ComputerController::class, 'index']);
    Route::post('/devices', [ComputerController::class, 'store'])->middleware('role:student');
    Route::get('/devices/{computer}/qr', [ComputerController::class, 'qr']);
    Route::get('/my-verifications', [GateVerificationController::class, 'studentIndex'])->middleware('role:student');

    Route::middleware('role:gate_officer')->group(function (): void {
        Route::post('/gate/verify', GateVerificationController::class)->middleware('throttle:30,1');
        Route::get('/verification-logs', [GateVerificationController::class, 'index']);
    });

    Route::middleware('role:administrator')->prefix('admin')->group(function (): void {
        Route::get('/users', [AdminController::class, 'users']);
        Route::post('/users', [AdminController::class, 'storeUser']);
        Route::patch('/users/{user}', [AdminController::class, 'updateUser']);
        Route::delete('/users/{user}', [AdminController::class, 'destroyUser']);
        Route::get('/students', [AdminController::class, 'students']);
        Route::post('/students', [AdminController::class, 'storeStudent']);
        Route::get('/logs', [AdminController::class, 'logs']);
        Route::get('/reports', [AdminController::class, 'reports']);
        Route::patch('/devices/{computer}', [ComputerController::class, 'update']);
        Route::patch('/devices/{computer}/status', [ComputerController::class, 'updateStatus']);
        Route::delete('/devices/{computer}', [ComputerController::class, 'destroy']);
    });
});
