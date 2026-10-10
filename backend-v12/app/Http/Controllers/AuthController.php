<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'student_id' => ['required', 'string', 'max:40', 'unique:users,student_id'],
            'password' => ['required', 'string', 'min:12'],
        ]);

        $user = User::create([...$data, 'role' => 'student']);

        return response()->json($this->sessionPayload($user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['The supplied credentials are incorrect.']]);
        }

        return response()->json($this->sessionPayload($user));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user(), 'serverTime' => now()->toIso8601String()]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'student_id' => [$user->role === 'student' ? 'required' : 'nullable', 'string', 'max:40', Rule::unique('users', 'student_id')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:12', 'confirmed'],
        ]);

        if ($user->role !== 'student') {
            $data['student_id'] = null;
        }
        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json(['user' => $user, 'serverTime' => now()->toIso8601String()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    private function sessionPayload(User $user): array
    {
        return [
            'token' => $user->createToken('smartgate-session')->plainTextToken,
            'user' => $user,
            'serverTime' => now()->toIso8601String(),
        ];
    }
}